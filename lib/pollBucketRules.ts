import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ruleMatchesTags } from "@/lib/pollShared";

export const bucketRuleInputSchema = z
  .object({
    bucketId: z.string().min(1),
    tagSlugs: z.array(z.string().min(1)),
  })
  .transform((input) => ({ ...input, tagSlugs: [...new Set(input.tagSlugs)] }))
  .refine((input) => input.tagSlugs.length >= 2, {
    message: "A rule needs at least two distinct tag conditions",
    path: ["tagSlugs"],
  });

export const bucketRuleUpdateSchema = z
  .object({
    bucketId: z.string().min(1).optional(),
    tagSlugs: z.array(z.string().min(1)).optional(),
    status: z.enum(["ACTIVE", "RETIRED"]).optional(),
  })
  .transform((input) => ({
    ...input,
    tagSlugs: input.tagSlugs ? [...new Set(input.tagSlugs)] : undefined,
  }))
  .refine((input) => input.tagSlugs === undefined || input.tagSlugs.length >= 2, {
    message: "A rule needs at least two distinct tag conditions",
    path: ["tagSlugs"],
  });

/** All rules, active and retired, newest first -- retired rules stay visible (retire,
 * don't delete, per the build spec) rather than disappearing from the admin list. */
export async function listBucketRules() {
  return prisma.bucketAttachmentRule.findMany({ orderBy: { createdAt: "desc" } });
}

/** Refuses an exact duplicate: an ACTIVE rule already attaching this same bucket via
 * this same tag-slug set (order-insensitive) would be a silent no-op that just clutters
 * the admin list, so it's rejected up front instead. `excludeRuleId` lets an edit compare
 * against every *other* active rule rather than always colliding with itself. */
async function assertNoDuplicateRule(bucketId: string, tagSlugs: string[], excludeRuleId?: string) {
  const candidateSet = new Set(tagSlugs);
  const existingRules = await prisma.bucketAttachmentRule.findMany({
    where: {
      status: "ACTIVE",
      bucketId,
      ...(excludeRuleId ? { id: { not: excludeRuleId } } : {}),
    },
    select: { tagSlugs: true },
  });
  const isDuplicate = existingRules.some(
    (r) => r.tagSlugs.length === candidateSet.size && r.tagSlugs.every((slug) => candidateSet.has(slug))
  );
  if (isDuplicate) {
    throw new Error("An active rule already attaches this bucket via this exact tag combination");
  }
}

async function assertNotCoreBucket(bucketId: string) {
  const coreBucket = await prisma.questionBucket.findFirst({ where: { isCore: true }, select: { id: true } });
  if (coreBucket && bucketId === coreBucket.id) {
    throw new Error("The Core bucket is already attached to every program -- rules don't apply to it");
  }
}

export async function createBucketRule(input: z.infer<typeof bucketRuleInputSchema>) {
  await assertNotCoreBucket(input.bucketId);
  await assertNoDuplicateRule(input.bucketId, input.tagSlugs);
  return prisma.bucketAttachmentRule.create({ data: { bucketId: input.bucketId, tagSlugs: input.tagSlugs } });
}

/**
 * Edits, retires, or reactivates a rule. There is deliberately no delete function --
 * retire (status: "RETIRED") is the only way to stop a rule from attaching; its row (and
 * the responses already collected against the bucket while it applied) are retained.
 * Changing `bucketId`/`tagSlugs` re-runs the same core-bucket and duplicate-rule guards
 * createBucketRule does; reactivating a rule (RETIRED -> ACTIVE) without touching its
 * bucket/tags also re-checks for a duplicate, since another active rule could have taken
 * its exact combination while this one was retired.
 */
export async function updateBucketRule(id: string, patch: z.infer<typeof bucketRuleUpdateSchema>) {
  const existing = await prisma.bucketAttachmentRule.findUniqueOrThrow({ where: { id } });
  const nextBucketId = patch.bucketId ?? existing.bucketId;
  const nextTagSlugs = patch.tagSlugs ?? existing.tagSlugs;
  const nextStatus = patch.status ?? existing.status;

  if (patch.bucketId !== undefined) {
    await assertNotCoreBucket(nextBucketId);
  }
  if (nextStatus === "ACTIVE") {
    await assertNoDuplicateRule(nextBucketId, nextTagSlugs, id);
  }

  return prisma.bucketAttachmentRule.update({
    where: { id },
    data: { bucketId: nextBucketId, tagSlugs: nextTagSlugs, status: nextStatus },
  });
}

/** Every ACTIVE rule's bucket id that matches a program's tag slugs, deduped and ordered
 * by the bucket's own display `order` -- lib/pollConfig.ts's getQuestionsForProgram
 * passes this straight into mergeRuleAttachedBucketIds. A rule pointing at a since-
 * deleted bucket drops out silently (the `questionBucket.findMany` below just won't
 * return it), same soft-ref tolerance as the rest of this schema. */
export async function getRuleAttachedBucketIds(programTagSlugs: string[]): Promise<string[]> {
  const rules = await prisma.bucketAttachmentRule.findMany({ where: { status: "ACTIVE" } });
  const matchedBucketIds = [
    ...new Set(rules.filter((r) => ruleMatchesTags(r.tagSlugs, programTagSlugs)).map((r) => r.bucketId)),
  ];
  if (matchedBucketIds.length === 0) return [];

  const buckets = await prisma.questionBucket.findMany({
    where: { id: { in: matchedBucketIds } },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  return buckets.map((b) => b.id);
}

export const bucketRulePreviewSchema = z.object({
  bucketId: z.string().min(1),
  tagSlugs: z.array(z.string().min(1)).min(2),
  excludeRuleId: z.string().min(1).optional(),
});

/**
 * The "how many programs will this newly affect" check surfaced before an admin can
 * save a rule create/edit -- see the build spec's "I don't want to silently change 80
 * programs' polls." `matched` is every program carrying all of `tagSlugs`; `newlyAffected`
 * narrows that to programs where `bucketId` isn't *already* effective there (not in the
 * program's manual bucketIds, and not attached by any other ACTIVE rule targeting the
 * same bucket -- `excludeRuleId` excludes the rule being edited from that check, so
 * editing a rule's tags previews against its own prior state correctly). Doesn't filter
 * by Program.status, matching lib/pollConfig.ts's bulkAssignBucket precedent.
 */
export async function previewBucketRule(input: z.infer<typeof bucketRulePreviewSchema>) {
  const [matchedPrograms, otherRules] = await Promise.all([
    prisma.program.findMany({
      where: { AND: input.tagSlugs.map((slug) => ({ tags: { some: { slug } } })) },
      select: {
        id: true,
        name: true,
        tags: { select: { slug: true } },
        pollConfig: { select: { bucketIds: true } },
      },
    }),
    prisma.bucketAttachmentRule.findMany({
      where: {
        status: "ACTIVE",
        bucketId: input.bucketId,
        ...(input.excludeRuleId ? { id: { not: input.excludeRuleId } } : {}),
      },
      select: { tagSlugs: true },
    }),
  ]);

  const newlyAffectedPrograms = matchedPrograms.filter((p) => {
    const manualBucketIds = p.pollConfig?.bucketIds ?? [];
    if (manualBucketIds.includes(input.bucketId)) return false;
    const programTagSlugs = p.tags.map((t) => t.slug);
    return !otherRules.some((r) => ruleMatchesTags(r.tagSlugs, programTagSlugs));
  });

  return {
    matched: matchedPrograms.length,
    newlyAffected: newlyAffectedPrograms.length,
    sampleNames: newlyAffectedPrograms.slice(0, 10).map((p) => p.name),
  };
}
