import slugify from "slugify";
import { prisma } from "@/lib/prisma";
import { coerceTint } from "@/lib/tagTints";

// Re-exported for convenience so server code can `import { coerceTint } from "@/lib/tags"`
// alongside the CRUD helpers below -- but client components must import from
// "@/lib/tagTints" directly (see that file for why the split exists).
export { coerceTint, VALID_TINTS } from "@/lib/tagTints";

export async function listTagCategories() {
  return prisma.tagCategory.findMany({ orderBy: { order: "asc" } });
}

export async function getTagsGroupedByCategory() {
  const [categories, tags] = await Promise.all([
    listTagCategories(),
    prisma.tag.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
  ]);

  const byCategory = new Map<string, typeof tags>();
  const uncategorized: typeof tags = [];
  for (const tag of tags) {
    if (!tag.category) {
      uncategorized.push(tag);
      continue;
    }
    const bucket = byCategory.get(tag.category);
    if (bucket) bucket.push(tag);
    else byCategory.set(tag.category, [tag]);
  }

  return {
    groups: categories.map((category) => ({
      category,
      tags: byCategory.get(category.slug) ?? [],
    })),
    uncategorized,
  };
}

function slugifyValue(value: string) {
  return slugify(value, { lower: true, strict: true });
}

type TagRow = Awaited<ReturnType<typeof prisma.tag.findMany>>[number];

/** Loads every tag once so a batch of name lookups (program create/update, edit review)
 * doesn't run one query per name. Small table (~100 rows) -- a full scan is cheaper and
 * simpler than a per-name findMany with an OR/insensitive-mode filter. */
async function tagLookupMaps() {
  const allTags = await prisma.tag.findMany();
  const byLowerName = new Map(allTags.map((t) => [t.name.toLowerCase(), t]));
  const bySlug = new Map(allTags.map((t) => [t.slug, t]));
  return { allTags, byLowerName, bySlug };
}

/** A typed-in name matches an existing tag by case-insensitive exact name first, then
 * by slug (slugify(name)) -- never fuzzily. The slug fallback exists because several
 * admin-seeded taxonomy tags (e.g. slug `integration-low`, name "Low integration") have
 * a slug that doesn't equal slugify(their own name); without it, saving a program
 * through the form would silently mint an uncategorized duplicate tag instead of
 * reattaching the canonical one -- that duplication is exactly what broke the browse
 * filter (see prisma/audit-tags.ts). */
function matchTag(name: string, byLowerName: Map<string, TagRow>, bySlug: Map<string, TagRow>) {
  return byLowerName.get(name.toLowerCase()) ?? bySlug.get(slugifyValue(name));
}

/** Resolves typed-in tag names to Tag ids for a program's `tags: { connect }`, creating
 * a genuinely new tag only when no existing tag matches by name or slug (see matchTag).
 * Used by createProgram/updateProgram (lib/programs.ts) and the moderated-edit apply
 * path (lib/programEdits.ts) so both write paths share one resolution rule. */
export async function resolveTagsByName(names: string[]): Promise<{ id: string }[]> {
  if (names.length === 0) return [];
  const { byLowerName, bySlug } = await tagLookupMaps();

  const results: { id: string }[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    const existing = matchTag(name, byLowerName, bySlug);
    if (existing) {
      results.push({ id: existing.id });
      continue;
    }
    const slug = slugifyValue(name);
    const created = await prisma.tag.create({ data: { name, slug } });
    results.push({ id: created.id });
    byLowerName.set(created.name.toLowerCase(), created);
    bySlug.set(created.slug, created);
  }
  return results;
}

/** Resolves typed-in tag names to *existing* Tag ids only, for a program's
 * `tags: { disconnect }` -- a name matching no tag is silently skipped (there is
 * nothing to disconnect if the tag never existed) rather than creating one. */
export async function findExistingTagIds(names: string[]): Promise<{ id: string }[]> {
  if (names.length === 0) return [];
  const { byLowerName, bySlug } = await tagLookupMaps();
  const results: { id: string }[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    const existing = matchTag(name, byLowerName, bySlug);
    if (existing) results.push({ id: existing.id });
  }
  return results;
}

/** Same matching rule as resolveTagsByName, but never creates a new Tag -- a name that
 * matches no existing tag is returned in `unknown` instead. Used for a non-moderator's
 * program submission (see createProgram's canCreateTags option), so an ordinary user
 * can't mint an arbitrary public Tag live; unmatched names are queued as PendingTag rows
 * for moderator approval instead. Deduped case-insensitively, same as parseTags. */
export async function resolveExistingTagsByName(
  names: string[]
): Promise<{ matched: { id: string }[]; unknown: string[] }> {
  if (names.length === 0) return { matched: [], unknown: [] };
  const { byLowerName, bySlug } = await tagLookupMaps();
  const matched: { id: string }[] = [];
  const unknown: string[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    const existing = matchTag(name, byLowerName, bySlug);
    if (existing) matched.push({ id: existing.id });
    else unknown.push(name);
  }
  return { matched, unknown };
}

export async function createTagCategory(input: { label: string; tint: string; showInFilter: boolean }) {
  const slug = slugifyValue(input.label);
  const maxOrder = await prisma.tagCategory.aggregate({ _max: { order: true } });
  return prisma.tagCategory.create({
    data: {
      slug,
      label: input.label,
      tint: coerceTint(input.tint),
      showInFilter: input.showInFilter,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
}

export async function updateTagCategory(
  id: string,
  input: Partial<{ label: string; tint: string; showInFilter: boolean; order: number }>
) {
  return prisma.tagCategory.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.tint !== undefined ? { tint: coerceTint(input.tint) } : {}),
      ...(input.showInFilter !== undefined ? { showInFilter: input.showInFilter } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
    },
  });
}

/** Deleting a category unsets it on member tags rather than deleting them -- tags
 * survive as uncategorized/general, matching how program-tag associations are never
 * touched by category management. */
export async function deleteTagCategory(id: string) {
  const category = await prisma.tagCategory.findUnique({ where: { id } });
  if (!category) return;
  await prisma.tag.updateMany({ where: { category: category.slug }, data: { category: null } });
  await prisma.tagCategory.delete({ where: { id } });
}

export async function createTag(input: { name: string; category: string | null }) {
  const slug = slugifyValue(input.name);
  // New tags land at the end of their category's display order (or the general pool's,
  // if uncategorized) rather than defaulting to 0, so they don't jump ahead of tags an
  // admin has already ordered.
  const maxOrder = await prisma.tag.aggregate({
    where: { category: input.category },
    _max: { order: true },
  });
  return prisma.tag.create({
    data: { name: input.name, slug, category: input.category, order: (maxOrder._max.order ?? -1) + 1 },
  });
}

export async function updateTag(
  id: string,
  input: Partial<{ name: string; category: string | null; order: number }>
) {
  return prisma.tag.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name, slug: slugifyValue(input.name) } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
    },
  });
}

export async function deleteTag(id: string) {
  return prisma.tag.delete({ where: { id } });
}

/** Sets `order` to each tag's index in `ids` (0..n-1), in one transaction. Used by the
 * admin reorder arrows for a single category group at a time -- normalizing the whole
 * group instead of swapping two `order` values means it self-heals ties (most seeded
 * tags share the default `order: 0`, so a two-row swap between equal values was a no-op)
 * and can't leave a half-applied swap if one write fails.
 *
 * `ids` may include a tag that's been deleted since the client last loaded the list (e.g.
 * a stale browser tab open across a tag deletion/merge) -- same soft-reference-rot
 * tolerance as Region.memberSlugs/BucketAttachmentRule.tagSlugs elsewhere in this app, so
 * a client update() against a since-deleted id doesn't throw P2025 and fail the whole
 * batch. Surviving ids are re-normalized to their index in the *filtered* list, not the
 * original list, so no gaps are introduced. */
export async function reorderTags(ids: string[]) {
  const existing = await prisma.tag.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const existingIds = new Set(existing.map((t) => t.id));
  const survivingIds = ids.filter((id) => existingIds.has(id));

  await prisma.$transaction(
    survivingIds.map((id, index) => prisma.tag.update({ where: { id }, data: { order: index } }))
  );
}

/** Every PUBLISHED program with its tags, for the /admin/tags/coverage page. Same
 * unpaginated "fetch everything once" convention every other admin list in this app
 * uses (listProgramsBestFor, getFacetData) -- the catalog is small enough that client-side
 * filtering/pagination over the full set is simpler than a paginated query. */
export async function listPublishedProgramsForCoverage() {
  return prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      name: true,
      slug: true,
      durationType: true,
      hasScholarship: true,
      hasCollegeCredit: true,
      travelType: true,
      tags: { select: { id: true, slug: true, name: true, category: true } },
    },
    orderBy: { name: "asc" },
  });
}

/** Replaces a program's tag set within exactly one category, leaving every other
 * category's tags (and every uncategorized tag) untouched -- unlike updateProgramTags
 * (lib/programs.ts), which replaces the *entire* tags array and would silently wipe out
 * gender/affiliation/age/location/etc. if called with just a type or essence selection.
 * Used by the /admin/tags/coverage inline editor for program-type and essence.
 *
 * `slugs` must all already exist as Tag rows *in this category* -- an unknown slug or one
 * belonging to a different category is rejected (never silently created or reattached to
 * the wrong family), per this repo's "propose from existing set, flag gaps" tag rule. */
export async function setCategoryTags(programId: string, category: string, slugs: string[]) {
  const uniqueSlugs = Array.from(new Set(slugs));
  const candidates = await prisma.tag.findMany({
    where: { slug: { in: uniqueSlugs } },
    select: { id: true, slug: true, category: true },
  });
  const bySlug = new Map(candidates.map((t) => [t.slug, t]));

  const invalid: string[] = [];
  const resolvedIds: string[] = [];
  for (const slug of uniqueSlugs) {
    const tag = bySlug.get(slug);
    if (!tag || tag.category !== category) {
      invalid.push(slug);
      continue;
    }
    resolvedIds.push(tag.id);
  }
  if (invalid.length > 0) {
    throw new InvalidCategoryTagsError(category, invalid);
  }

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { tags: { where: { category }, select: { id: true } } },
  });
  if (!program) {
    const err = new Error("Program not found") as Error & { code: string };
    err.code = "P2025";
    throw err;
  }
  const currentIds = program.tags.map((t) => t.id);

  return prisma.program.update({
    where: { id: programId },
    data: {
      tags: {
        disconnect: currentIds.map((id) => ({ id })),
        connect: resolvedIds.map((id) => ({ id })),
      },
    },
    select: { id: true, tags: { select: { id: true, slug: true, name: true, category: true } } },
  });
}

export class InvalidCategoryTagsError extends Error {
  constructor(
    public category: string,
    public slugs: string[]
  ) {
    super(`Unknown or wrong-category slug(s) for "${category}": ${slugs.join(", ")}`);
    this.name = "InvalidCategoryTagsError";
  }
}

/** Merges `sourceId` into `targetId`: repoints every program association from source to
 * target (skipping programs already tagged with target, since Program<->Tag is a unique
 * relation pair) then deletes the source tag. Used by admins to consolidate near-duplicate
 * tags (e.g. "volunteer" / "volunteering") without touching program data by hand. */
export async function mergeTags(sourceId: string, targetId: string) {
  if (sourceId === targetId) return;
  const source = await prisma.tag.findUnique({ where: { id: sourceId }, include: { programs: { select: { id: true } } } });
  if (!source) return;
  for (const program of source.programs) {
    await prisma.program.update({
      where: { id: program.id },
      data: { tags: { connect: { id: targetId }, disconnect: { id: sourceId } } },
    });
  }
  await prisma.tag.delete({ where: { id: sourceId } });
}
