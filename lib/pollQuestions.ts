import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { questionLabelsSchema } from "@/lib/pollShared";

/** dropdownOptions is a nullable Json column; Prisma requires the Prisma.JsonNull
 * sentinel (not plain `null`) to explicitly clear it, so a bare `null` from the zod
 * schema needs translating before it reaches the client. */
function toJsonInput(
  value: unknown
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export const questionInputSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only"),
  text: z.string().trim().min(1).max(300),
  type: z.enum(["STARS", "RADIO", "DROPDOWN"]),
  labels: questionLabelsSchema,
  dropdownOptions: z.unknown().nullable().optional(),
});

export const questionUpdateSchema = z.object({
  text: z.string().trim().min(1).max(300).optional(),
  type: z.enum(["STARS", "RADIO", "DROPDOWN"]).optional(),
  labels: questionLabelsSchema.optional(),
  dropdownOptions: z.unknown().nullable().optional(),
  status: z.enum(["ACTIVE", "RETIRED"]).optional(),
});

export async function listQuestions({ includeRetired = true }: { includeRetired?: boolean } = {}) {
  const questions = await prisma.pollQuestion.findMany({
    where: includeRetired ? undefined : { status: "ACTIVE" },
    orderBy: { key: "asc" },
    include: { _count: { select: { answers: true } } },
  });
  return questions.map(({ _count, ...question }) => ({ ...question, answerCount: _count.answers }));
}

export async function createQuestion(input: z.infer<typeof questionInputSchema>) {
  return prisma.pollQuestion.create({
    data: {
      key: input.key,
      text: input.text,
      type: input.type,
      labels: input.labels,
      dropdownOptions: toJsonInput(input.dropdownOptions),
    },
  });
}

/**
 * Editing `text` on a question that already has at least one answer bumps `version` in
 * the same write -- unconditional server-side policy, per the build spec ("editing text
 * when responses exist bumps version and warns me first"). The *warning* is a
 * client-side confirm dialog in QuestionManager.tsx (it already has `answerCount` from
 * listQuestions to decide whether to show it); this function doesn't take a "did you
 * confirm" flag because the bump itself isn't optional once the precondition is met.
 */
export async function updateQuestion(id: string, input: z.infer<typeof questionUpdateSchema>) {
  const existing = await prisma.pollQuestion.findUniqueOrThrow({ where: { id } });
  const textChanged = input.text !== undefined && input.text !== existing.text;
  let versionBumped = false;
  if (textChanged) {
    const answerCount = await prisma.pollAnswer.count({ where: { questionId: id } });
    versionBumped = answerCount > 0;
  }
  return prisma.pollQuestion.update({
    where: { id },
    data: {
      ...input,
      dropdownOptions: toJsonInput(input.dropdownOptions),
      ...(versionBumped ? { version: { increment: 1 } } : {}),
    },
  });
}

/**
 * Only allowed when the question has zero answers -- the `question` relation on
 * PollAnswer is onDelete: Restrict, so this would fail at the DB level regardless, but
 * checking first gives a clean error message instead of a raw Postgres foreign-key
 * violation. Retire the question instead once it has responses, per the build spec.
 * Scrubs the id out of every bucket's questionIds and every program config's
 * added/removedQuestionIds in the same transaction, so deleting a never-answered
 * question never leaves a dangling soft reference behind (the "soft ref rot" this
 * codebase already guards against for Region.memberSlugs).
 */
export async function deleteQuestion(id: string) {
  const answerCount = await prisma.pollAnswer.count({ where: { questionId: id } });
  if (answerCount > 0) {
    throw new Error("This question has answers and can't be deleted -- retire it instead");
  }

  await prisma.$transaction(async (tx) => {
    const buckets = await tx.questionBucket.findMany({ where: { questionIds: { has: id } } });
    for (const bucket of buckets) {
      await tx.questionBucket.update({
        where: { id: bucket.id },
        data: { questionIds: bucket.questionIds.filter((qid) => qid !== id) },
      });
    }

    const configs = await tx.programPollConfig.findMany({
      where: { OR: [{ addedQuestionIds: { has: id } }, { removedQuestionIds: { has: id } }] },
    });
    for (const config of configs) {
      await tx.programPollConfig.update({
        where: { programId: config.programId },
        data: {
          addedQuestionIds: config.addedQuestionIds.filter((qid) => qid !== id),
          removedQuestionIds: config.removedQuestionIds.filter((qid) => qid !== id),
        },
      });
    }

    await tx.pollQuestion.delete({ where: { id } });
  });
}

export const bucketInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  questionIds: z.array(z.string().min(1)).default([]),
});

export const bucketUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  questionIds: z.array(z.string().min(1)).optional(),
  status: z.enum(["ACTIVE", "RETIRED"]).optional(),
});

export async function listBuckets({ includeRetired = true }: { includeRetired?: boolean } = {}) {
  return prisma.questionBucket.findMany({
    where: includeRetired ? undefined : { status: "ACTIVE" },
    orderBy: { order: "asc" },
  });
}

export async function getCoreBucket() {
  return prisma.questionBucket.findFirst({ where: { isCore: true } });
}

/** Never accepts `isCore` -- the Core bucket is seeded once (prisma/seed-polls.ts) and
 * that field is never part of this input schema, so there is no code path through the
 * admin UI or API that could create a second core bucket. */
export async function createBucket(input: z.infer<typeof bucketInputSchema>) {
  const maxOrder = await prisma.questionBucket.aggregate({ _max: { order: true } });
  return prisma.questionBucket.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      questionIds: input.questionIds,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

/** Refuses to retire the Core bucket -- `isCore` itself is never editable (same
 * reasoning as createBucket above), so the only way this function needs to protect
 * against is `status: "RETIRED"` landing on the one bucket every program depends on. */
export async function updateBucket(id: string, input: z.infer<typeof bucketUpdateSchema>) {
  const existing = await prisma.questionBucket.findUniqueOrThrow({ where: { id } });
  if (existing.isCore && input.status === "RETIRED") {
    throw new Error("The Core bucket can never be retired");
  }
  return prisma.questionBucket.update({ where: { id }, data: input });
}

/** Refuses to delete the Core bucket. Scrubs the id out of every program config's
 * bucketIds in the same transaction, same soft-ref cleanup as deleteQuestion above. */
export async function deleteBucket(id: string) {
  const existing = await prisma.questionBucket.findUniqueOrThrow({ where: { id } });
  if (existing.isCore) {
    throw new Error("The Core bucket can never be deleted");
  }

  await prisma.$transaction(async (tx) => {
    const configs = await tx.programPollConfig.findMany({ where: { bucketIds: { has: id } } });
    for (const config of configs) {
      await tx.programPollConfig.update({
        where: { programId: config.programId },
        data: { bucketIds: config.bucketIds.filter((bid) => bid !== id) },
      });
    }
    await tx.questionBucket.delete({ where: { id } });
  });
}

/** Reorders buckets globally (the up/down arrows in BucketManager.tsx) -- same
 * "assign array-index order in one transaction" pattern as lib/tags.ts's reorderTags.
 * The Core bucket can be reordered like any other (its position among buckets, not its
 * isCore-ness, is what `order` controls). */
export async function reorderBuckets(ids: string[]) {
  await prisma.$transaction(
    ids.map((id, index) => prisma.questionBucket.update({ where: { id }, data: { order: index } }))
  );
}
