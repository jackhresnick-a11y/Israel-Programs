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
  PollScaleType,
} from "@/app/generated/prisma/enums";

export const scaleTypeSchema = z.enum(["EVALUATIVE", "DESCRIPTIVE"]);

/** Integrity signals a response can carry without being dropped -- see the
 * PollResponse.flags doc comment in schema.prisma. A response can carry several.
 * TOKEN_OVER_CAP/TOKEN_REVOKED/TOKEN_EXPIRED/REPEAT_IP/REPEAT_BROWSER are the
 * submit-time anti-abuse checks that route an anonymous response to FLAGGED instead of
 * COUNTED (see lib/pollResponses.ts's submitAnonymousResponse) -- they're the main
 * integrity layer now that there's no after-submit email verification step.
 * DUPLICATE_EMAIL is a historical flag from that removed flow, kept only because past
 * responses may still carry it (the moderation UI still labels it). */
export const POLL_FLAGS = {
  TOKEN_OVER_CAP: "token_over_cap",
  TOKEN_REVOKED: "token_revoked",
  TOKEN_EXPIRED: "token_expired",
  REPEAT_IP: "repeat_ip",
  REPEAT_BROWSER: "repeat_browser",
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
  scaleType: PollScaleType;
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

/** One resolved (non-retired) question's result, whether or not it has any answers yet
 * -- `mean`/`count` are null/0 when nobody has answered it, which the results list
 * renders as an empty ring/track rather than omitting the block entirely. `bucketId` is
 * the owning QuestionBucket's id (core questions get the core bucket's id) and drives
 * the results list's per-bucket color, matched against `PollSummaryDTO.buckets`.
 * `labels` is the question's own full 5-value label set -- an EVALUATIVE question uses
 * `labels[0]`/`labels[4]` for its "1 low · 5 high" line (see RatingRing); a DESCRIPTIVE
 * question renders as a spectrum track (see DescriptiveTrack) whose two end labels are
 * always the extremes `labels[0]`/`labels[4]`, plus a "Closest to" line naming
 * `labels[round(mean)-1]` -- so it needs all 5. */
export type PollSummaryQuestionDTO = {
  key: string;
  text: string;
  mean: number | null;
  count: number;
  scaleType: PollScaleType;
  bucketId: string | null;
  labels: string[];
};

/** One legend entry for the results grid -- ordered Core-first then extras, same
 * order the rating form itself presents buckets in (see resolvePollQuestionSet). */
export type PollSummaryBucketDTO = {
  id: string;
  name: string;
};

export type PollSummaryDTO = {
  state: PollSummaryState;
  counted: number;
  minResponsesToPublish: number;
  displayFormat: PollDisplayFormat;
  placeholderOverride: string | null;
  overallMean: number | null;
  questions: PollSummaryQuestionDTO[];
  buckets: PollSummaryBucketDTO[];
  overallHistogram: [number, number, number, number, number];
};

/** One approved review as rendered on the public program page -- never carries
 * responseId/email/ipHash/consent metadata (the RSC-payload-leak rule this codebase
 * applies to every model with a public/sensitive split). `yearAttended` is the only
 * respondent-identifying detail shown, and only when given; 0 renders as "Earlier" per
 * yearAttendedOptions below. */
export type PollReviewItemDTO = {
  text: string;
  yearAttended: number | null;
};

/** All approved reviews for one question, grouped so the program page can render one
 * header per question with its reviews underneath -- see lib/pollResults.ts's
 * listPublicReviews, which orders these groups by the program's live (resolved)
 * question order. */
export type PollReviewGroupDTO = {
  questionKey: string;
  questionText: string;
  reviews: PollReviewItemDTO[];
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

/** No `.min(1)` -- a question the respondent skips simply isn't in this array, and an
 * all-skipped submission is legitimate (the empty-submission refine below only blocks
 * a response with *neither* an answer nor a review, not a review-only one). There is no
 * "answer with a null value": `answerInputSchema.value` still requires a real 1-5,
 * which is what makes a skip representable only as *absence*, never as a stored null
 * or sentinel row. */
export const answerListSchema = z.array(answerInputSchema);

/** Question ids the respondent explicitly marked N/A -- like a skip, an N/A'd question
 * never gets a PollAnswer row (absence is still the only representation of "no
 * value"). This array only records that the opt-out was deliberate, distinct from a
 * question the respondent simply never touched, so moderation can show "N/A" instead
 * of "Skipped." N/A marks alone (with no answers and no reviews) don't satisfy the
 * empty-submission refine below -- see requireAnswerOrReview. */
export const naQuestionIdsSchema = z.array(z.string().min(1)).default([]);

export const completionSchema = z.enum(["FULL", "PARTIAL", "DROPPED"]).nullable().optional();

/** One consented, per-question public review. `consent` must be the literal `true` --
 * the client only ever includes an entry here for a review whose checkbox was actually
 * checked (an unchecked review is simply omitted, never sent as `consent: false`), and
 * this schema is the second of three consent enforcement layers (client omission,
 * this zod literal, and the DB's hand-written `CHECK ("consentGiven")` -- see the
 * PollReview migration). */
export const reviewInputSchema = z.object({
  questionId: z.string().min(1),
  text: z.string().trim().min(1).max(1000),
  consent: z.literal(true),
});

export const reviewListSchema = z.array(reviewInputSchema);

/** A response carrying neither a real answer nor a consented review isn't a
 * response -- skips alone never block submission, but *nothing at all* does. Explicit
 * N/A marks don't count as content either (they're the deliberate-opt-out equivalent
 * of a skip, not an answer), so an all-N/A submission with no answers and no reviews
 * still fails this. */
function requireAnswerOrReview(body: { answers: unknown[]; reviews: unknown[] }) {
  return body.answers.length > 0 || body.reviews.length > 0;
}
const EMPTY_SUBMISSION_MESSAGE = "Answer at least one question or write a review";

/** A question can't simultaneously carry a real 1-5 value and be marked N/A -- the
 * client only ever sends one or the other per question, and this is the server-side
 * backstop against a malformed or tampered payload claiming both. */
function noAnswerNaOverlap(body: { answers: { questionId: string }[]; naQuestionIds: string[] }) {
  const naSet = new Set(body.naQuestionIds);
  return body.answers.every((a) => !naSet.has(a.questionId));
}
const NA_OVERLAP_MESSAGE = "A question can't be both answered and marked N/A";

/** Signed-in submit: no ref token, no honeypot (Clerk already gates identity). */
export const signedInSubmitSchema = z
  .object({
    programId: z.string().min(1),
    answers: answerListSchema,
    reviews: reviewListSchema.default([]),
    naQuestionIds: naQuestionIdsSchema,
  })
  .refine(requireAnswerOrReview, { message: EMPTY_SUBMISSION_MESSAGE, path: ["answers"] })
  .refine(noAnswerNaOverlap, { message: NA_OVERLAP_MESSAGE, path: ["naQuestionIds"] });

/** Anonymous link-path submit: `website` is a honeypot field real users never fill in
 * (app/api/contact/route.ts precedent) -- checked before rate limiting so bots can't
 * detect the limiter by probing it. */
export const anonymousSubmitSchema = z
  .object({
    programId: z.string().min(1),
    answers: answerListSchema,
    reviews: reviewListSchema.default([]),
    naQuestionIds: naQuestionIdsSchema,
    ref: z.string().min(1).optional(),
    yearAttended: yearAttendedSchema,
    completion: completionSchema,
    website: z.string().optional(),
    // Optional, upfront -- never required and never gates counting (there's no
    // after-submit email-verification step anymore). Omitted entirely by the client
    // when left blank, same "absence over empty string" convention as an unchecked
    // review.
    email: z.string().trim().email().max(320).optional(),
  })
  .refine(requireAnswerOrReview, { message: EMPTY_SUBMISSION_MESSAGE, path: ["answers"] })
  .refine(noAnswerNaOverlap, { message: NA_OVERLAP_MESSAGE, path: ["naQuestionIds"] });

/** The "Add more detail" / details endpoint: non-core answers and reviews for an
 * already-submitted response. No empty-submission refine here -- an empty details
 * payload is a no-op, not an error (the parent response already satisfied that rule
 * at initial submit). */
export const detailsSubmitSchema = z
  .object({
    answers: answerListSchema,
    reviews: reviewListSchema.default([]),
    naQuestionIds: naQuestionIdsSchema,
  })
  .refine(noAnswerNaOverlap, { message: NA_OVERLAP_MESSAGE, path: ["naQuestionIds"] });

export const questionLabelsSchema = z.array(z.string().min(1)).length(5);

export function pollDraftKey(programSlug: string): string {
  return `poll-draft:${programSlug}`;
}

/** The only bucket-attachment-rule shape ever passed to a client component -- see
 * BucketRuleManager.tsx. */
export type BucketAttachmentRuleDTO = {
  id: string;
  bucketId: string;
  tagSlugs: string[];
  status: PollLifecycleStatus;
  createdAt: Date;
};

/** A rule matches a program when the program carries EVERY one of the rule's tag slugs
 * (ANDed -- a single-tag rule just requires that one tag) -- an empty tagSlugs list
 * never matches anything (guards against the vacuous `[].every(...) === true` case;
 * real rules always carry >= 1 via lib/pollBucketRules.ts's bucketRuleInputSchema, but
 * this function doesn't assume that invariant itself). Pure and client-safe so it's
 * usable both server-side (lib/pollBucketRules.ts's getRuleAttachedBucketIds) and in
 * tests without a database. */
export function ruleMatchesTags(ruleTagSlugs: string[], programTagSlugs: string[]): boolean {
  if (ruleTagSlugs.length === 0) return false;
  const programSlugSet = new Set(programTagSlugs);
  return ruleTagSlugs.every((slug) => programSlugSet.has(slug));
}

/**
 * Composes a program's manually-attached bucket ids with the bucket ids that rule
 * matching additionally attaches, for lib/pollConfig.ts's getQuestionsForProgram to pass
 * to resolvePollQuestionSet as `bucketIds`. Manual attachments keep their stored order
 * and always come first; rule-attached ids not already present follow, in the order the
 * caller passes them (lib/pollConfig.ts sorts those by the bucket's own `order` before
 * calling this) -- a bucket present in both lists appears once, at its manual position.
 * This is the ONLY place manual and rule-attached buckets combine; everything downstream
 * (removedQuestionIds stripping, retired-bucket/dead-id dropping, a bucket left with zero
 * resolvable questions) is unchanged resolver behavior applied to the merged list, which
 * is what gives "removedQuestionIds still wins over a rule-attached bucket" for free.
 */
export function mergeRuleAttachedBucketIds(manualBucketIds: string[], ruleBucketIds: string[]): string[] {
  const manualSet = new Set(manualBucketIds);
  const seen = new Set<string>();
  const newFromRules = ruleBucketIds.filter((id) => {
    if (manualSet.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return [...manualBucketIds, ...newFromRules];
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

  // A question can be listed in more than one bucket (a real case in this question
  // bank: one question lives in both Core and an extra bucket) -- `seen` tracks every
  // question id already placed (starting with core's, then accumulating as extras are
  // processed in config.bucketIds order) so the same question never appears twice in
  // the resolved set. This matters beyond display: the signed-in rate form submits
  // core+extras as one flat answers array, and a question appearing twice there
  // produces two PollAnswer rows for the same (responseId, questionId), which throws
  // a P2002 unique-constraint violation on submit ("Failed to submit rating"). Core
  // always wins; between two extras, whichever comes first in bucketIds order wins. A
  // bucket left with zero questions after dedup is dropped by the existing
  // zero-questions filter below, same as any other empty extra.
  const seen = new Set(core.map((q) => q.id));
  const extras = config.bucketIds
    .map((bucketId) => bucketsById.get(bucketId))
    .filter((bucket): bucket is PollBucketDTO => bucket !== undefined && bucket.status === "ACTIVE" && !bucket.isCore)
    .map((bucket) => {
      const bucketQuestions = bucket.questionIds
        .filter((id) => !removed.has(id) && !seen.has(id))
        .map((id) => activeQuestion(id))
        .filter((q): q is PollQuestionDTO => q !== undefined);
      for (const q of bucketQuestions) seen.add(q.id);
      return { bucket, questions: bucketQuestions };
    })
    .filter((entry) => entry.questions.length > 0);

  return { core, extras };
}

/** The full set of question ids a resolved question set covers -- core plus every extra
 * bucket's questions, deduped. This is "everything the poll form could have presented,"
 * and is the single derivation both the render path and the submit-validation allowlist
 * must use: a route that grabs `.core` alone and forgets `.extras` will reject answers
 * to questions the form itself just rendered (see app/api/polls/responses/route.ts's
 * fix for exactly that bug). */
export function flattenResolvedQuestionIds(resolved: ResolvedPollQuestionSet): string[] {
  return [...new Set([...resolved.core, ...resolved.extras.flatMap((e) => e.questions)].map((q) => q.id))];
}

/** Why one resolved question is on a program's poll -- see resolveProgramQuestionProvenance. */
export type QuestionSource =
  | { type: "core" }
  | { type: "rule"; bucketId: string; bucketName: string; tagSlugs: string[] }
  | { type: "manual"; bucketId: string; bucketName: string }
  | { type: "added" };

export type ProvenanceQuestionDTO<Q = PollQuestionDTO> = {
  question: Q;
  source: QuestionSource;
};

/**
 * Same resolution as resolvePollQuestionSet, but returns a flat list of every resolved
 * question labeled with WHY it's on this program's poll -- Core, a matching filter rule,
 * a manual bucket attachment, or a one-off admin add -- for the admin Edit panel's "why
 * is each question here, what would I be overriding" view. resolvePollQuestionSet (via
 * lib/pollConfig.ts's getQuestionsForProgram) remains the single source of truth for
 * what actually renders on the poll; this is presentation only.
 *
 * Generic over the question shape (`Q`) -- the admin UI's QuestionRow type (no
 * `dropdownOptions`) doesn't structurally match PollQuestionDTO, and this function only
 * ever reads `id`/`status` off a question, so there's no reason to force callers to the
 * wider DTO shape.
 *
 * Unlike resolvePollQuestionSet's already-merged `config.bucketIds`, `manualBucketIds`
 * and `ruleMatches` are passed SEPARATELY here so a bucket's origin can be labeled.
 * Precedence for a bucket reachable more than one way (both manually attached AND
 * matching an active filter rule): labeled "rule", not "manual" -- that's the more
 * informative fact, since the bucket would attach on its own even if the manual
 * attachment were removed. A question itself can only be reached one way in practice
 * (buckets don't share questions), so the only real ambiguity is at the bucket level.
 */
export function resolveProgramQuestionProvenance<Q extends { id: string; status: PollLifecycleStatus }>(
  config: { manualBucketIds: string[]; addedQuestionIds: string[]; removedQuestionIds: string[] },
  buckets: PollBucketDTO[],
  questions: Q[],
  ruleMatches: { bucketId: string; tagSlugs: string[] }[]
): { questions: ProvenanceQuestionDTO<Q>[]; removedQuestionIds: string[] } {
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  const bucketsById = new Map(buckets.map((b) => [b.id, b]));
  const removed = new Set(config.removedQuestionIds);
  const ruleTagSlugsByBucketId = new Map(ruleMatches.map((r) => [r.bucketId, r.tagSlugs]));

  const activeQuestion = (id: string): Q | undefined => {
    const q = questionsById.get(id);
    if (!q || q.status !== "ACTIVE") return undefined;
    return q;
  };

  const result: ProvenanceQuestionDTO<Q>[] = [];
  const seenQuestionIds = new Set<string>();

  const coreBucket = buckets.find((b) => b.isCore && b.status === "ACTIVE");
  const coreIds = (coreBucket?.questionIds ?? []).filter((id) => !removed.has(id));
  for (const id of coreIds) {
    const q = activeQuestion(id);
    if (!q || seenQuestionIds.has(id)) continue;
    seenQuestionIds.add(id);
    result.push({ question: q, source: { type: "core" } });
  }

  // Manual attachments keep their stored order and come first, same convention as
  // mergeRuleAttachedBucketIds; rule-matched ids not already in that list follow.
  // Labeling itself doesn't depend on this order -- a bucket in both sets always labels
  // "rule" via the lookup below, regardless of which array contributed its position.
  const effectiveBucketIds = [...new Set([...config.manualBucketIds, ...ruleMatches.map((r) => r.bucketId)])];
  for (const bucketId of effectiveBucketIds) {
    const bucket = bucketsById.get(bucketId);
    if (!bucket || bucket.status !== "ACTIVE" || bucket.isCore) continue;
    const tagSlugs = ruleTagSlugsByBucketId.get(bucketId);
    const source: QuestionSource = tagSlugs
      ? { type: "rule", bucketId, bucketName: bucket.name, tagSlugs }
      : { type: "manual", bucketId, bucketName: bucket.name };
    for (const id of bucket.questionIds) {
      if (removed.has(id)) continue;
      const q = activeQuestion(id);
      if (!q || seenQuestionIds.has(id)) continue;
      seenQuestionIds.add(id);
      result.push({ question: q, source });
    }
  }

  // One-off admin adds -- a question pulled from a bucket not otherwise effective here.
  for (const id of config.addedQuestionIds) {
    if (removed.has(id) || seenQuestionIds.has(id)) continue;
    const q = activeQuestion(id);
    if (!q) continue;
    seenQuestionIds.add(id);
    result.push({ question: q, source: { type: "added" } });
  }

  return { questions: result, removedQuestionIds: config.removedQuestionIds };
}
