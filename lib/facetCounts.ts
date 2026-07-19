/**
 * Pure, client-safe leave-one-out faceting math for the /programs browse filters. Split
 * out from lib/programs.ts for the same reason as lib/tagTints.ts -- no Prisma import,
 * so it can be unit-tested without a DB and (if ever needed) imported from a "use
 * client" component. Mirrors lib/programs.ts's buildTagAndClauses semantics exactly:
 * OR within a tag category, AND across categories/duration -- these functions must stay
 * in lockstep with that query or the displayed counts will lie about what clicking an
 * option actually returns.
 */

export type FacetProgram = {
  id: string;
  durationType: string;
  tagSlugs: string[];
};

export type FacetSelections = {
  duration: string[];
  tags: string[];
};

function groupSlugsByCategory(
  tagCategoryBySlug: Map<string, string | null>,
  slugs: string[]
): Map<string, string[]> {
  const byCategory = new Map<string, string[]>();
  for (const slug of slugs) {
    const category = tagCategoryBySlug.get(slug) ?? null;
    const key = category ?? "__general__";
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(slug);
    else byCategory.set(key, [slug]);
  }
  return byCategory;
}

function matchesDuration(program: FacetProgram, duration: string[]): boolean {
  return duration.length === 0 || duration.includes(program.durationType);
}

function matchesTagGroups(program: FacetProgram, groups: Map<string, string[]>): boolean {
  const tagSet = new Set(program.tagSlugs);
  for (const slugs of groups.values()) {
    if (!slugs.some((slug) => tagSet.has(slug))) return false;
  }
  return true;
}

/** Whether a program matches the full current selection set -- same predicate
 * lib/programs.ts's listPrograms query expresses in Postgres, reimplemented in memory
 * for the facet math below. */
export function matchesSelections(
  program: FacetProgram,
  selections: FacetSelections,
  tagCategoryBySlug: Map<string, string | null>
): boolean {
  return (
    matchesDuration(program, selections.duration) &&
    matchesTagGroups(program, groupSlugsByCategory(tagCategoryBySlug, selections.tags))
  );
}

/**
 * Leave-one-out option counts for the Duration dropdown and every tag-backed category
 * dropdown. Each option's count holds every OTHER dimension's current selection fixed
 * and asks "how many programs match if this option alone were selected in its own
 * dimension" -- not OR'd with whatever else is already checked in the same dropdown.
 * This is what powers the "(N)" shown next to each checkbox, so a user sees a zero
 * coming before they click into it.
 */
export function computeFacetCounts(
  programs: FacetProgram[],
  selections: FacetSelections,
  tagCategoryBySlug: Map<string, string | null>,
  durationValues: string[],
  categorySlugOptions: Map<string, string[]>
): { duration: Record<string, number>; tags: Record<string, number> } {
  const tagGroups = groupSlugsByCategory(tagCategoryBySlug, selections.tags);

  const duration: Record<string, number> = {};
  const programsMatchingAllTags = programs.filter((p) => matchesTagGroups(p, tagGroups));
  for (const value of durationValues) {
    duration[value] = programsMatchingAllTags.filter((p) => p.durationType === value).length;
  }

  const tags: Record<string, number> = {};
  for (const [category, optionSlugs] of categorySlugOptions) {
    const otherGroups = new Map(tagGroups);
    otherGroups.delete(category);
    const candidates = programs.filter(
      (p) => matchesDuration(p, selections.duration) && matchesTagGroups(p, otherGroups)
    );
    for (const slug of optionSlugs) {
      tags[slug] = candidates.filter((p) => p.tagSlugs.includes(slug)).length;
    }
  }

  return { duration, tags };
}

/**
 * Region options are an OR-group over several `location`-category tag slugs (see
 * lib/regions.ts), not a single slug, so they need their own leave-one-out pass over
 * the same "location" category exclusion computeFacetCounts uses for its tag options.
 */
export function computeRegionCounts(
  programs: FacetProgram[],
  selections: FacetSelections,
  tagCategoryBySlug: Map<string, string | null>,
  regions: { slug: string; memberSlugs: string[] }[],
  locationCategory = "location"
): Record<string, number> {
  const tagGroups = groupSlugsByCategory(tagCategoryBySlug, selections.tags);
  const otherGroups = new Map(tagGroups);
  otherGroups.delete(locationCategory);
  const candidates = programs.filter(
    (p) => matchesDuration(p, selections.duration) && matchesTagGroups(p, otherGroups)
  );
  const counts: Record<string, number> = {};
  for (const region of regions) {
    counts[region.slug] = candidates.filter((p) =>
      region.memberSlugs.some((slug) => p.tagSlugs.includes(slug))
    ).length;
  }
  return counts;
}

/** One currently-active filter dimension -- "duration" (the whole `duration` URL param)
 * or a single tag category (all selected slugs whose Tag.category equals it, which for
 * `category: "location"` is exactly "Region", since Region is a UI-only grouping over
 * location-category tags with no separate selection state of its own). */
export type ActiveDimension =
  | { kind: "duration" }
  | { kind: "category"; category: string; label: string };

/**
 * For the empty-state "remove this filter" chips: for each currently active dimension,
 * the result count if that one dimension were cleared entirely, holding every other
 * dimension's selection fixed. Powers "Remove Semester -> 26 programs" and picking the
 * best single filter to relax for a "closest matches" suggestion.
 */
export function dropOneCounts(
  programs: FacetProgram[],
  selections: FacetSelections,
  tagCategoryBySlug: Map<string, string | null>,
  activeDimensions: ActiveDimension[]
): { dimension: ActiveDimension; count: number }[] {
  const tagGroups = groupSlugsByCategory(tagCategoryBySlug, selections.tags);
  return activeDimensions.map((dimension) => {
    if (dimension.kind === "duration") {
      const count = programs.filter((p) => matchesTagGroups(p, tagGroups)).length;
      return { dimension, count };
    }
    const groups = new Map(tagGroups);
    groups.delete(dimension.category);
    const count = programs.filter(
      (p) => matchesDuration(p, selections.duration) && matchesTagGroups(p, groups)
    ).length;
    return { dimension, count };
  });
}
