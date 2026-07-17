/**
 * Split out from lib/pollQuestions.ts/lib/pollConfig.ts because those files import the
 * Prisma client (via lib/prisma.ts, which pulls in `pg`) -- this file holds only the
 * pure types/zod/constants that RateForm.tsx and other "use client" components need,
 * following the same split as lib/tagTints.ts / lib/missionBlocks.ts.
 */
import { z } from "zod";
import type {
  PollQuestionType,
  PollLifecycleStatus,
  PollDisplayFormat,
} from "@/app/generated/prisma/enums";

/** Integrity signals a response can carry without being dropped -- see the
 * PollResponse.flags doc comment in schema.prisma. A response can carry several. */
export const POLL_FLAGS = {
  TOKEN_OVER_CAP: "token_over_cap",
  TOKEN_REVOKED: "token_revoked",
  TOKEN_EXPIRED: "token_expired",
  REPEAT_IP: "repeat_ip",
  DUPLICATE_EMAIL: "duplicate_email",
} as const;

export type PollFlag = (typeof POLL_FLAGS)[keyof typeof POLL_FLAGS];

/** The only question shape ever passed to a client component -- no answer data, no
 * response data, nothing sensitive. */
export type PollQuestionDTO = {
  id: string;
  key: string;
  text: string;
  type: PollQuestionType;
  labels: string[];
  dropdownOptions: unknown;
  version: number;
  status: PollLifecycleStatus;
};

export type PollBucketDTO = {
  id: string;
  name: string;
  description: string | null;
  questionIds: string[];
  order: number;
  isCore: boolean;
  status: PollLifecycleStatus;
};

/** The resolved question set for one program's rating form: Core questions (always
 * present, minus any per-program removals, plus per-program additions) plus any extra
 * buckets attached to the program. */
export type ResolvedPollQuestionSet = {
  core: PollQuestionDTO[];
  extras: { bucket: PollBucketDTO; questions: PollQuestionDTO[] }[];
};

export type PollSummaryState = "be_first" | "collecting" | "under_review" | "published";

export type PollSummaryDTO = {
  state: PollSummaryState;
  countedVerified: number;
  minResponsesToPublish: number;
  displayFormat: PollDisplayFormat;
  placeholderOverride: string | null;
  overallMean: number | null;
  questions: { key: string; text: string; mean: number; count: number }[];
  overallHistogram: [number, number, number, number, number];
};

export const yearAttendedSchema = z.coerce.number().int().min(0).nullable().optional();

/** 0 is the "Earlier" sentinel -- null/undefined means the field wasn't answered. */
export function yearAttendedOptions(now: Date = new Date()): { value: number; label: string }[] {
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
  return [...years.map((year) => ({ value: year, label: String(year) })), { value: 0, label: "Earlier" }];
}

export const answerInputSchema = z.object({
  questionId: z.string().min(1),
  value: z.coerce.number().int().min(1).max(5),
});

export const answerListSchema = z.array(answerInputSchema).min(1);

export const completionSchema = z.enum(["FULL", "PARTIAL", "DROPPED"]).nullable().optional();

/** Signed-in submit: no ref token, no honeypot (Clerk already gates identity). */
export const signedInSubmitSchema = z.object({
  programId: z.string().min(1),
  answers: answerListSchema,
});

/** Anonymous link-path submit: `website` is a honeypot field real users never fill in
 * (app/api/contact/route.ts precedent) -- checked before rate limiting so bots can't
 * detect the limiter by probing it. */
export const anonymousSubmitSchema = z.object({
  programId: z.string().min(1),
  answers: answerListSchema,
  ref: z.string().min(1).optional(),
  yearAttended: yearAttendedSchema,
  completion: completionSchema,
  website: z.string().max(0).optional(),
});

export const emailAttachSchema = z.object({
  email: z.string().email(),
});

export const questionLabelsSchema = z.array(z.string().min(1)).length(5);

export function pollDraftKey(programSlug: string): string {
  return `poll-draft:${programSlug}`;
}

/**
 * Pure resolver: given a program's config, every bucket, and every question, returns
 * the ordered question set the rating form should render. Core questions are always
 * included first (ordered by the Core bucket's questionIds), minus any program-level
 * removals, plus program-level additions appended at the end of core. Extra (non-core)
 * buckets follow, in the program config's bucketIds order, each with its own questions
 * in the bucket's questionIds order. Retired questions/buckets and dead soft-ref ids (a
 * bucket pointing at a deleted question, a config pointing at a retired/deleted bucket)
 * are silently dropped rather than throwing -- the public rating form must never break
 * because admin data has a stale reference, same "soft ref rot" posture as
 * Region.memberSlugs elsewhere in this codebase.
 */
export function resolvePollQuestionSet(
  config: { bucketIds: string[]; addedQuestionIds: string[]; removedQuestionIds: string[] },
  buckets: PollBucketDTO[],
  questions: PollQuestionDTO[]
): ResolvedPollQuestionSet {
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  const bucketsById = new Map(buckets.map((b) => [b.id, b]));
  const removed = new Set(config.removedQuestionIds);

  const activeQuestion = (id: string): PollQuestionDTO | undefined => {
    const q = questionsById.get(id);
    if (!q || q.status !== "ACTIVE") return undefined;
    return q;
  };

  const coreBucket = buckets.find((b) => b.isCore && b.status === "ACTIVE");
  const coreIds = (coreBucket?.questionIds ?? []).filter((id) => !removed.has(id));
  const addedIds = config.addedQuestionIds.filter((id) => !removed.has(id) && !coreIds.includes(id));
  const core = [...coreIds, ...addedIds]
    .map((id) => activeQuestion(id))
    .filter((q): q is PollQuestionDTO => q !== undefined);

  const extras = config.bucketIds
    .map((bucketId) => bucketsById.get(bucketId))
    .filter((bucket): bucket is PollBucketDTO => bucket !== undefined && bucket.status === "ACTIVE" && !bucket.isCore)
    .map((bucket) => ({
      bucket,
      questions: bucket.questionIds
        .filter((id) => !removed.has(id))
        .map((id) => activeQuestion(id))
        .filter((q): q is PollQuestionDTO => q !== undefined),
    }))
    .filter((entry) => entry.questions.length > 0);

  return { core, extras };
}
