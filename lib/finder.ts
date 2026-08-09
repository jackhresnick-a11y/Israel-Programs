import slugify from "slugify";
import { DurationType } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const DURATION_VALUES = new Set<string>(Object.values(DurationType));

function slugifyValue(value: string) {
  return slugify(value, { lower: true, strict: true });
}

export async function listFinderQuestions({ includeRetired = false }: { includeRetired?: boolean } = {}) {
  return prisma.finderQuestion.findMany({
    where: includeRetired ? undefined : { status: "ACTIVE" },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: {
      options: {
        where: includeRetired ? undefined : { status: "ACTIVE" },
        orderBy: [{ order: "asc" }, { id: "asc" }],
      },
    },
  });
}

/**
 * Loads the given FinderOption ids, unions their tagSlugs/durationValues, drops any tag
 * slug with no live Tag row and any value outside the DurationType enum (an option can
 * go stale if a tag is later renamed/deleted from app/admin/tags), and returns the
 * /programs URL the browse page's own filter bar would produce for that same selection
 * -- riding app/programs/page.tsx's existing `tags`/`duration` params, nothing else.
 * Never emits `q`, `hasScholarship`, `hasCollegeCredit`, or `travelType`: no question in
 * this flow maps to them, and hasScholarship/hasCollegeCredit must never be read or
 * written anywhere in this feature.
 */
export async function buildProgramsHref(optionIds: string[]): Promise<string> {
  const ids = optionIds.filter(Boolean);
  if (ids.length === 0) return "/programs";

  const options = await prisma.finderOption.findMany({ where: { id: { in: ids } } });

  const tagSlugs = new Set<string>();
  const durationValues = new Set<string>();
  for (const option of options) {
    for (const slug of option.tagSlugs) tagSlugs.add(slug);
    for (const value of option.durationValues) durationValues.add(value);
  }

  if (tagSlugs.size === 0 && durationValues.size === 0) return "/programs";

  const liveTags =
    tagSlugs.size > 0
      ? await prisma.tag.findMany({ where: { slug: { in: [...tagSlugs] } }, select: { slug: true } })
      : [];
  const liveSlugs = new Set(liveTags.map((t) => t.slug));

  const params = new URLSearchParams();
  const validTags = [...tagSlugs].filter((slug) => liveSlugs.has(slug));
  const validDurations = [...durationValues].filter((value) => DURATION_VALUES.has(value));
  if (validTags.length > 0) params.set("tags", validTags.join(","));
  if (validDurations.length > 0) params.set("duration", validDurations.join(","));

  const qs = params.toString();
  return qs ? `/programs?${qs}` : "/programs";
}

/** `key` is derived from `prompt` at creation time, same "stable identity assigned once,
 * not re-derived on rename" posture as lib/regions.ts's createRegion -- renaming the
 * prompt later (updateFinderQuestion) never changes `key`. */
export async function createFinderQuestion(input: { prompt: string; helpText?: string | null }) {
  const maxOrder = await prisma.finderQuestion.aggregate({ _max: { order: true } });
  return prisma.finderQuestion.create({
    data: {
      key: slugifyValue(input.prompt),
      prompt: input.prompt,
      helpText: input.helpText ?? null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

export async function updateFinderQuestion(
  id: string,
  input: Partial<{ prompt: string; helpText: string | null; order: number; status: "ACTIVE" | "RETIRED" }>
) {
  return prisma.finderQuestion.update({
    where: { id },
    data: {
      ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      ...(input.helpText !== undefined ? { helpText: input.helpText } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
}

export async function deleteFinderQuestion(id: string) {
  return prisma.finderQuestion.delete({ where: { id } });
}

/** Sets `order` to each question's index in `ids` (0..n-1), in one transaction --
 * same normalize-the-whole-list shape as lib/tags.ts's reorderTags. */
export async function reorderFinderQuestions(ids: string[]) {
  await prisma.$transaction(
    ids.map((id, index) => prisma.finderQuestion.update({ where: { id }, data: { order: index } }))
  );
}

export async function createFinderOption(input: {
  questionId: string;
  label: string;
  helpText?: string | null;
  tagSlugs?: string[];
  durationValues?: string[];
}) {
  const maxOrder = await prisma.finderOption.aggregate({
    where: { questionId: input.questionId },
    _max: { order: true },
  });
  return prisma.finderOption.create({
    data: {
      questionId: input.questionId,
      label: input.label,
      helpText: input.helpText ?? null,
      tagSlugs: input.tagSlugs ?? [],
      durationValues: input.durationValues ?? [],
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

export async function updateFinderOption(
  id: string,
  input: Partial<{
    label: string;
    helpText: string | null;
    order: number;
    status: "ACTIVE" | "RETIRED";
    tagSlugs: string[];
    durationValues: string[];
  }>
) {
  return prisma.finderOption.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.helpText !== undefined ? { helpText: input.helpText } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.tagSlugs !== undefined ? { tagSlugs: input.tagSlugs } : {}),
      ...(input.durationValues !== undefined ? { durationValues: input.durationValues } : {}),
    },
  });
}

export async function deleteFinderOption(id: string) {
  return prisma.finderOption.delete({ where: { id } });
}

/** Sets `order` to each option's index in `ids` (0..n-1) within its question, in one
 * transaction -- same shape as reorderFinderQuestions/lib/tags.ts's reorderTags. */
export async function reorderFinderOptions(ids: string[]) {
  await prisma.$transaction(
    ids.map((id, index) => prisma.finderOption.update({ where: { id }, data: { order: index } }))
  );
}
