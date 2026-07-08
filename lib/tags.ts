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
