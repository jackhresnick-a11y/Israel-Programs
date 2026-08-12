import slugify from "slugify";
import { DurationType } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { assembleProgramsHref } from "@/lib/finderTargets";

// Re-exported for convenience so server code can `import { assembleProgramsHref } from
// "@/lib/finder"` alongside the CRUD helpers below -- but a client component must
// import from "@/lib/finderTargets" directly (see that file for why the split exists).
export { assembleProgramsHref } from "@/lib/finderTargets";

const DURATION_VALUES = new Set<string>(Object.values(DurationType));

/** Exported so lib/flow.ts (the same "typed name -> slug, reject an unknown tag" shape
 * for FlowOption.tagSlugs) shares this instead of hand-duplicating it -- CLAUDE.md
 * documents slug-approximation drift as a real, recurring failure mode, so the two
 * admin-facing "reject an unknown tag" write paths must stay byte-for-byte identical. */
export function slugifyValue(value: string) {
  return slugify(value, { lower: true, strict: true });
}

/** Thrown by createFinderOption/updateFinderOption when asked to save a tagSlugs entry
 * with no matching live Tag row. The admin UI's tag picker (components/admin/
 * FinderQuestionsManager.tsx) only ever offers real Tag.slug values, so this guards
 * against a direct API call (or a future non-picker caller) writing an option that
 * silently does nothing at redirect time -- buildProgramsHref drops an unknown slug
 * rather than erroring, which is the right behavior for an option that went stale
 * *after* being saved (e.g. its tag was later deleted), but not for a write that never
 * pointed at a real tag in the first place. */
export class UnknownTagSlugsError extends Error {
  slugs: string[];
  constructor(slugs: string[]) {
    super(`Unknown tag slug(s): ${slugs.join(", ")}`);
    this.name = "UnknownTagSlugsError";
    this.slugs = slugs;
  }
}

/** Exported for the same reason as slugifyValue above -- lib/flow.ts's option tag-slug
 * validation reuses this instead of a second, driftable copy. */
export async function assertTagSlugsExist(slugs: string[]) {
  if (slugs.length === 0) return;
  const rows = await prisma.tag.findMany({ where: { slug: { in: slugs } }, select: { slug: true } });
  const found = new Set(rows.map((r) => r.slug));
  const missing = slugs.filter((slug) => !found.has(slug));
  if (missing.length > 0) throw new UnknownTagSlugsError(missing);
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

  const validTags = [...tagSlugs].filter((slug) => liveSlugs.has(slug));
  const validDurations = [...durationValues].filter((value) => DURATION_VALUES.has(value));
  return assembleProgramsHref(validTags, validDurations);
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
  await assertTagSlugsExist(input.tagSlugs ?? []);
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
  if (input.tagSlugs !== undefined) await assertTagSlugsExist(input.tagSlugs);
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
