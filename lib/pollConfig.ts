import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  resolvePollQuestionSet,
  type PollBucketDTO,
  type PollQuestionDTO,
  type ResolvedPollQuestionSet,
} from "@/lib/pollShared";
import type { PollDisplayFormat } from "@/app/generated/prisma/enums";

export type ProgramPollConfigDTO = {
  bucketIds: string[];
  addedQuestionIds: string[];
  removedQuestionIds: string[];
  resultsVisible: boolean;
  minResponsesToPublish: number;
  displayFormat: PollDisplayFormat;
  placeholderOverride: string | null;
};

const DEFAULT_POLL_CONFIG: ProgramPollConfigDTO = {
  bucketIds: [],
  addedQuestionIds: [],
  removedQuestionIds: [],
  resultsVisible: false,
  minResponsesToPublish: 7,
  displayFormat: "STARS",
  placeholderOverride: null,
};

/** A missing row reads as these schema defaults rather than throwing -- a program
 * created after prisma/seed-polls.ts ran (or any future program) degrades gracefully
 * instead of 500ing the program page or the /rate form. */
export async function getProgramPollConfig(programId: string): Promise<ProgramPollConfigDTO> {
  const row = await prisma.programPollConfig.findUnique({ where: { programId } });
  if (!row) return DEFAULT_POLL_CONFIG;
  return {
    bucketIds: row.bucketIds,
    addedQuestionIds: row.addedQuestionIds,
    removedQuestionIds: row.removedQuestionIds,
    resultsVisible: row.resultsVisible,
    minResponsesToPublish: row.minResponsesToPublish,
    displayFormat: row.displayFormat,
    placeholderOverride: row.placeholderOverride,
  };
}

function toBucketDTO(b: {
  id: string;
  name: string;
  description: string | null;
  questionIds: string[];
  order: number;
  isCore: boolean;
  status: "ACTIVE" | "RETIRED";
}): PollBucketDTO {
  return b;
}

function toQuestionDTO(q: {
  id: string;
  key: string;
  text: string;
  type: "STARS" | "RADIO" | "DROPDOWN";
  labels: string[];
  dropdownOptions: unknown;
  version: number;
  status: "ACTIVE" | "RETIRED";
}): PollQuestionDTO {
  return q;
}

/** Resolves the live question set (Core + any extra buckets, minus removals, plus
 * per-program additions) for one program's rating form. Fetches every bucket/question --
 * at the question-bank sizes this system is designed for (a handful of buckets, tens of
 * questions) that's cheap, and it lets the pure resolvePollQuestionSet in lib/pollShared.ts
 * stay the single source of truth for the resolution logic instead of duplicating it in
 * a query. */
export async function getQuestionsForProgram(programId: string): Promise<ResolvedPollQuestionSet> {
  const [config, buckets, questions] = await Promise.all([
    getProgramPollConfig(programId),
    prisma.questionBucket.findMany(),
    prisma.pollQuestion.findMany(),
  ]);
  return resolvePollQuestionSet(config, buckets.map(toBucketDTO), questions.map(toQuestionDTO));
}

export type ProgramWithPollConfig = {
  id: string;
  name: string;
  slug: string;
  config: ProgramPollConfigDTO;
};

/** Every published program with its poll config (or the schema defaults, for a program
 * that predates prisma/seed-polls.ts or was created since) -- feeds
 * /admin/polls/programs. `q` filters by name, applied server-side (a simple
 * case-insensitive contains) since the admin table can hit hundreds of rows. */
export async function listProgramsWithPollConfig({ q }: { q?: string } = {}): Promise<ProgramWithPollConfig[]> {
  const programs = await prisma.program.findMany({
    where: {
      status: "PUBLISHED",
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    select: { id: true, name: true, slug: true, pollConfig: true },
    orderBy: { name: "asc" },
  });

  return programs.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    config: p.pollConfig
      ? {
          bucketIds: p.pollConfig.bucketIds,
          addedQuestionIds: p.pollConfig.addedQuestionIds,
          removedQuestionIds: p.pollConfig.removedQuestionIds,
          resultsVisible: p.pollConfig.resultsVisible,
          minResponsesToPublish: p.pollConfig.minResponsesToPublish,
          displayFormat: p.pollConfig.displayFormat,
          placeholderOverride: p.pollConfig.placeholderOverride,
        }
      : DEFAULT_POLL_CONFIG,
  }));
}

export const programPollConfigPatchSchema = z.object({
  bucketIds: z.array(z.string().min(1)).optional(),
  addedQuestionIds: z.array(z.string().min(1)).optional(),
  removedQuestionIds: z.array(z.string().min(1)).optional(),
  resultsVisible: z.boolean().optional(),
  minResponsesToPublish: z.coerce.number().int().min(1).optional(),
  displayFormat: z.enum(["STARS", "PERCENT", "BOTH"]).optional(),
  placeholderOverride: z.string().trim().max(300).nullable().optional(),
});

/**
 * Upserts one program's poll config. `bucketIds` is defensively scrubbed of the Core
 * bucket's id before writing, even though no admin UI control ever offers adding it --
 * this is the API-layer half of "the Core bucket cannot be removed from any program,
 * enforce in admin UI AND at the API layer" (Core is never *stored* in bucketIds at
 * all, so there's nothing to remove; this guard is what stops a crafted request from
 * making it look present, which would be meaningless but confusing in the admin table).
 */
export async function upsertProgramPollConfig(
  programId: string,
  patch: z.infer<typeof programPollConfigPatchSchema>
) {
  let data = patch;
  if (patch.bucketIds) {
    const coreBucket = await prisma.questionBucket.findFirst({ where: { isCore: true }, select: { id: true } });
    if (coreBucket) {
      data = { ...patch, bucketIds: patch.bucketIds.filter((id) => id !== coreBucket.id) };
    }
  }

  return prisma.programPollConfig.upsert({
    where: { programId },
    create: { programId, ...data },
    update: data,
  });
}

export const bulkAssignSchema = z.object({
  bucketId: z.string().min(1),
  tagSlugs: z.array(z.string().min(1)).min(1),
  mode: z.enum(["add", "remove"]),
});

/**
 * Bulk-assigns (or removes) one bucket across every program carrying any of the given
 * tag slugs -- the "I am not clicking 362 times" tool. Resolves program ids the same
 * way lib/programs.ts's tag filtering does: `tags: { some: { slug: { in } } }`. Returns
 * both the matched-program count and the actually-changed count (a program that
 * already has/lacks the bucket is a no-op, not counted as "affected") so the admin UI
 * and this repo's "print expected vs. actual row counts after a bulk change" rule both
 * get a real number to show.
 */
export async function bulkAssignBucket(input: z.infer<typeof bulkAssignSchema>) {
  const coreBucket = await prisma.questionBucket.findFirst({ where: { isCore: true }, select: { id: true } });
  if (coreBucket && input.bucketId === coreBucket.id) {
    throw new Error("The Core bucket is already attached to every program -- there's nothing to bulk-assign");
  }

  const programs = await prisma.program.findMany({
    where: { tags: { some: { slug: { in: input.tagSlugs } } } },
    select: { id: true },
  });

  let affected = 0;
  await prisma.$transaction(async (tx) => {
    for (const program of programs) {
      const config = await tx.programPollConfig.findUnique({ where: { programId: program.id } });
      const currentBucketIds = config?.bucketIds ?? [];
      const alreadyHasIt = currentBucketIds.includes(input.bucketId);

      let nextBucketIds: string[];
      if (input.mode === "add") {
        if (alreadyHasIt) continue;
        nextBucketIds = [...currentBucketIds, input.bucketId];
      } else {
        if (!alreadyHasIt) continue;
        nextBucketIds = currentBucketIds.filter((id) => id !== input.bucketId);
      }

      await tx.programPollConfig.upsert({
        where: { programId: program.id },
        create: { programId: program.id, bucketIds: nextBucketIds },
        update: { bucketIds: nextBucketIds },
      });
      affected++;
    }
  });

  return { matchedPrograms: programs.length, affected };
}
