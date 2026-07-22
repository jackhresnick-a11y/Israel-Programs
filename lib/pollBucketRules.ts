import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ruleMatchesProgram, durationTypeSchema } from "@/lib/pollShared";
import type { DurationType } from "@/app/generated/prisma/enums";

export const bucketRuleInputSchema = z
  .object({
    bucketId: z.string().min(1),
    tagSlugs: z.array(z.string().min(1)),
    durationTypes: z.array(durationTypeSchema).default([]),
  })
  .transform((input) => ({
    ...input,
    tagSlugs: [...new Set(input.tagSlugs)],
    durationTypes: [...new Set(input.durationTypes)],
  }))
  .refine((input) => input.tagSlugs.length >= 1 || input.durationTypes.length >= 1, {
    message: "A rule needs at least one tag or duration condition",
    path: ["tagSlugs"],
  });

/* Deliberately no "at least one condition" refine here, unlike bucketRuleInputSchema --
 * a patch can validly omit tagSlugs (or durationTypes) to leave that condition
 * unchanged from the existing row, so the schema alone can't tell whether the *merged*
 * result would be empty on both. updateBucketRule checks that invariant itself once it
 * has computed the merged next state. */
export const bucketRuleUpdateSchema = z
  .object({
    bucketId: z.string().min(1).optional(),
    tagSlugs: z.array(z.string().min(1)).optional(),
    durationTypes: z.array(durationTypeSchema).optional(),
    status: z.enum(["ACTIVE", "RETIRED"]).optional(),
  })
  .transform((input) => ({
    ...input,
    tagSlugs: input.tagSlugs ? [...new Set(input.tagSlugs)] : undefined,
    durationTypes: input.durationTypes ? [...new Set(input.durationTypes)] : undefined,
  }));

/** All rules, active and retired, newest first -- retired rules stay visible (retire,
 * don't delete, per the build spec) rather than disappearing from the admin list. */
export async function listBucketRules() {
  return prisma.bucketAttachmentRule.findMany({ orderBy: { createdAt: "desc" } });
}

/** Refuses an exact duplicate: an ACTIVE rule already attaching this same bucket via
 * this same tag-slug set AND duration-type set (order-insensitive) would be a silent
 * no-op that just clutters the admin list, so it's rejected up front instead.
 * `excludeRuleId` lets an edit compare against every *other* active rule rather than
 * always colliding with itself. */
async function assertNoDuplicateRule(
  bucketId: string,
  tagSlugs: string[],
  durationTypes: DurationType[],
  excludeRuleId?: string
) {
  const candidateTagSet = new Set(tagSlugs);
  const candidateDurationSet = new Set(durationTypes);
  const existingRules = await prisma.bucketAttachmentRule.findMany({
    where: {
      status: "ACTIVE",
      bucketId,
      ...(excludeRuleId ? { id: { not: excludeRuleId } } : {}),
    },
    select: { tagSlugs: true, durationTypes: true },
  });
  const isDuplicate = existingRules.some(
    (r) =>
      r.tagSlugs.length === candidateTagSet.size &&
      r.tagSlugs.every((slug) => candidateTagSet.has(slug)) &&
      r.durationTypes.length === candidateDurationSet.size &&
      r.durationTypes.every((d) => candidateDurationSet.has(d))
  );
  if (isDuplicate) {
    throw new Error("An active rule already attaches this bucket via this exact tag/duration combination");
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
  await assertNoDuplicateRule(input.bucketId, input.tagSlugs, input.durationTypes);
  return prisma.bucketAttachmentRule.create({
    data: { bucketId: input.bucketId, tagSlugs: input.tagSlugs, durationTypes: input.durationTypes },
  });
}

/**
 * Edits, retires, or reactivates a rule. There is deliberately no delete function --
 * retire (status: "RETIRED") is the only way to stop a rule from attaching; its row (and
 * the responses already collected against the bucket while it applied) are retained.
 * Changing `bucketId`/`tagSlugs`/`durationTypes` re-runs the same core-bucket and
 * duplicate-rule guards createBucketRule does; reactivating a rule (RETIRED -> ACTIVE)
 * without touching its conditions also re-checks for a duplicate, since another active
 * rule could have taken its exact combination while this one was retired. The merged
 * next state must still carry at least one condition (a tag or a duration) -- the schema
 * itself can't enforce this (see bucketRuleUpdateSchema's comment), so it's checked here
 * against `nextTagSlugs`/`nextDurationTypes` after merging patch onto existing.
 */
export async function updateBucketRule(id: string, patch: z.infer<typeof bucketRuleUpdateSchema>) {
  const existing = await prisma.bucketAttachmentRule.findUniqueOrThrow({ where: { id } });
  const nextBucketId = patch.bucketId ?? existing.bucketId;
  const nextTagSlugs = patch.tagSlugs ?? existing.tagSlugs;
  const nextDurationTypes = patch.durationTypes ?? existing.durationTypes;
  const nextStatus = patch.status ?? existing.status;

  if (nextTagSlugs.length === 0 && nextDurationTypes.length === 0) {
    throw new Error("A rule needs at least one tag or duration condition");
  }
  if (patch.bucketId !== undefined) {
    await assertNotCoreBucket(nextBucketId);
  }
  if (nextStatus === "ACTIVE") {
    await assertNoDuplicateRule(nextBucketId, nextTagSlugs, nextDurationTypes, id);
  }

  return prisma.bucketAttachmentRule.update({
    where: { id },
    data: { bucketId: nextBucketId, tagSlugs: nextTagSlugs, durationTypes: nextDurationTypes, status: nextStatus },
  });
}

/** Every ACTIVE rule's bucket id that matches a program's tag slugs and duration type,
 * deduped and ordered by the bucket's own display `order` -- lib/pollConfig.ts's
 * getQuestionsForProgram passes this straight into mergeRuleAttachedBucketIds. A rule
 * pointing at a since-deleted bucket drops out silently (the `questionBucket.findMany`
 * below just won't return it), same soft-ref tolerance as the rest of this schema. */
export async function getRuleAttachedBucketIds(
  programTagSlugs: string[],
  programDurationType: DurationType
): Promise<string[]> {
  const rules = await prisma.bucketAttachmentRule.findMany({ where: { status: "ACTIVE" } });
  const matchedBucketIds = [
    ...new Set(
      rules
        .filter((r) =>
          ruleMatchesProgram(r, { tagSlugs: programTagSlugs, durationType: programDurationType })
        )
        .map((r) => r.bucketId)
    ),
  ];
  if (matchedBucketIds.length === 0) return [];

  const buckets = await prisma.questionBucket.findMany({
    where: { id: { in: matchedBucketIds } },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  return buckets.map((b) => b.id);
}

export const bucketRulePreviewSchema = z
  .object({
    bucketId: z.string().min(1),
    tagSlugs: z.array(z.string().min(1)).default([]),
    durationTypes: z.array(durationTypeSchema).default([]),
    excludeRuleId: z.string().min(1).optional(),
  })
  .refine((input) => input.tagSlugs.length >= 1 || input.durationTypes.length >= 1, {
    message: "A rule needs at least one tag or duration condition",
    path: ["tagSlugs"],
  });

/**
 * The "how many programs will this newly affect" check surfaced before an admin can
 * save a rule create/edit -- see the build spec's "I don't want to silently change 80
 * programs' polls." `matched` is every program carrying all of `tagSlugs` AND (if given)
 * whose durationType is one of `durationTypes`; `newlyAffected` narrows that to programs
 * where `bucketId` isn't *already* effective there (not in the program's manual
 * bucketIds, and not attached by any other ACTIVE rule targeting the same bucket --
 * `excludeRuleId` excludes the rule being edited from that check, so editing a rule's
 * conditions previews against its own prior state correctly). Doesn't filter by
 * Program.status, matching lib/pollConfig.ts's bulkAssignBucket precedent.
 */
export async function previewBucketRule(input: z.infer<typeof bucketRulePreviewSchema>) {
  const [matchedPrograms, otherRules] = await Promise.all([
    prisma.program.findMany({
      where: {
        AND: input.tagSlugs.map((slug) => ({ tags: { some: { slug } } })),
        ...(input.durationTypes.length > 0 ? { durationType: { in: input.durationTypes } } : {}),
      },
      select: {
        id: true,
        name: true,
        durationType: true,
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
      select: { tagSlugs: true, durationTypes: true },
    }),
  ]);

  const newlyAffectedPrograms = matchedPrograms.filter((p) => {
    const manualBucketIds = p.pollConfig?.bucketIds ?? [];
    if (manualBucketIds.includes(input.bucketId)) return false;
    const programTagSlugs = p.tags.map((t) => t.slug);
    return !otherRules.some((r) =>
      ruleMatchesProgram(r, { tagSlugs: programTagSlugs, durationType: p.durationType })
    );
  });

  return {
    matched: matchedPrograms.length,
    newlyAffected: newlyAffectedPrograms.length,
    sampleNames: newlyAffectedPrograms.slice(0, 10).map((p) => p.name),
  };
}
