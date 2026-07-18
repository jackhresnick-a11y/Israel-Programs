import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ProgramFaqDTO } from "@/lib/programFaqShared";

/** A visitor's "Ask a question" submission -- always DRAFT, source "visitor", with
 * server-stamped consentAt (never client-supplied). Nothing here ever publishes; an
 * admin must write an answer and explicitly publish via updateFaq. */
export async function submitVisitorQuestion(input: { programId: string; question: string; ipHash: string }) {
  return prisma.programFAQ.create({
    data: {
      programId: input.programId,
      question: input.question,
      source: "visitor",
      status: "DRAFT",
      consentGiven: true,
      consentAt: new Date(),
      ipHash: input.ipHash,
    },
  });
}

/** Published FAQ entries for the public program page, in curated order. Selects only
 * the public-safe fields -- never status/source/consent/ipHash/moderator fields, same
 * RSC-payload-leak rule this codebase applies to every model with a public/sensitive
 * split. `answer` is guaranteed non-null here since updateFaq refuses to publish an
 * unanswered entry. */
export async function listPublishedFaqs(programId: string): Promise<ProgramFaqDTO[]> {
  const rows = await prisma.programFAQ.findMany({
    where: { programId, status: "PUBLISHED" },
    orderBy: { sortOrder: "asc" },
    select: { id: true, question: true, answer: true },
  });
  return rows.map((r) => ({ id: r.id, question: r.question, answer: r.answer ?? "" }));
}

/** The moderation queue: visitor-submitted questions still awaiting an answer/decision.
 * Deliberately scoped to `source: "visitor"` -- an admin's own unpublished draft FAQ
 * (source "staff"/"admin"/etc, also DRAFT) isn't something anyone needs to "moderate,"
 * it's just unfinished curation work, so it doesn't show up here or count toward the
 * pending badge. */
const PENDING_QUESTION_WHERE = { source: "visitor", status: "DRAFT" } as const;

export async function listPendingQuestions() {
  return prisma.programFAQ.findMany({
    where: PENDING_QUESTION_WHERE,
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { program: { select: { name: true, slug: true } } },
  });
}

export async function countPendingQuestions(): Promise<number> {
  return prisma.programFAQ.count({ where: PENDING_QUESTION_WHERE });
}

/** Every FAQ entry (any status/source) for one program's admin curation view. */
export async function listFaqsForProgram(programId: string) {
  return prisma.programFAQ.findMany({
    where: { programId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export const createFaqSchema = z.object({
  programId: z.string().min(1),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(2000).nullable().optional(),
  source: z.string().trim().max(60).nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export const updateFaqSchema = z.object({
  question: z.string().trim().min(1).max(500).optional(),
  answer: z.string().trim().min(1).max(2000).nullable().optional(),
  source: z.string().trim().max(60).nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "REJECTED"]).optional(),
});

export type FaqWriteResult = { ok: true } | { ok: false; reason: string };

function publishGuard(answer: string | null | undefined, status: string | undefined): string | null {
  if (status === "PUBLISHED" && (!answer || answer.trim().length === 0)) {
    return "Can't publish a question with no answer";
  }
  return null;
}

/** Admin-authored FAQ creation -- source is a free-text provenance label ("staff",
 * "admin", "alumni poll", ...), never "visitor" (that value is reserved for
 * submitVisitorQuestion, which this function doesn't share a code path with). Refuses
 * to create a row already marked PUBLISHED with no answer. */
export async function createFaq(input: z.infer<typeof createFaqSchema>): Promise<FaqWriteResult> {
  const guardError = publishGuard(input.answer, input.status);
  if (guardError) return { ok: false, reason: guardError };

  const maxOrder = await prisma.programFAQ.aggregate({
    where: { programId: input.programId },
    _max: { sortOrder: true },
  });

  await prisma.programFAQ.create({
    data: {
      programId: input.programId,
      question: input.question,
      answer: input.answer ?? null,
      source: input.source ?? "admin",
      status: input.status ?? "DRAFT",
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });
  return { ok: true };
}

/**
 * Answers, edits, publishes, unpublishes, or rejects an FAQ entry -- all through one
 * patch-shaped update, same convention as lib/pollConfig.ts's upsertProgramPollConfig.
 * Refuses to flip `status: "PUBLISHED"` while the row (after this patch) has no
 * answer, whether the entry is a fresh visitor question being answered for the first
 * time or an existing published entry whose answer is being cleared.
 */
export async function updateFaq(id: string, patch: z.infer<typeof updateFaqSchema>, moderatorId?: string): Promise<FaqWriteResult> {
  const existing = await prisma.programFAQ.findUnique({ where: { id }, select: { answer: true } });
  if (!existing) return { ok: false, reason: "FAQ entry not found" };

  const nextAnswer = patch.answer !== undefined ? patch.answer : existing.answer;
  const guardError = publishGuard(nextAnswer, patch.status);
  if (guardError) return { ok: false, reason: guardError };

  await prisma.programFAQ.update({
    where: { id },
    data: {
      ...patch,
      ...(patch.status === "PUBLISHED" || patch.status === "REJECTED"
        ? { moderatedBy: moderatorId ?? null, moderatedAt: new Date() }
        : {}),
    },
  });
  return { ok: true };
}

/** Rejects a pending visitor question -- retained, never deleted, same posture as
 * PollReview and PollResponse. */
export async function rejectFaq(id: string, moderatorId: string, note?: string): Promise<FaqWriteResult> {
  const existing = await prisma.programFAQ.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, reason: "FAQ entry not found" };

  await prisma.programFAQ.update({
    where: { id },
    data: { status: "REJECTED", moderatedBy: moderatorId, moderatedAt: new Date(), moderatorNote: note ?? null },
  });
  return { ok: true };
}

/** Reorders one program's FAQ entries -- same "assign array-index order in one
 * transaction" pattern as lib/pollQuestions.ts's reorderBuckets. */
export async function reorderFaqs(ids: string[]) {
  await prisma.$transaction(
    ids.map((id, index) => prisma.programFAQ.update({ where: { id }, data: { sortOrder: index } }))
  );
}

/** Only ever deletes an admin-authored row that never had public exposure -- a visitor
 * submission is always rejected, never deleted, same retain-never-delete posture as
 * every other user-submitted content in this codebase. */
export async function deleteFaq(id: string): Promise<FaqWriteResult> {
  const existing = await prisma.programFAQ.findUnique({ where: { id }, select: { source: true } });
  if (!existing) return { ok: false, reason: "FAQ entry not found" };
  if (existing.source === "visitor") {
    return { ok: false, reason: "Visitor-submitted questions can't be deleted -- reject them instead" };
  }

  await prisma.programFAQ.delete({ where: { id } });
  return { ok: true };
}
