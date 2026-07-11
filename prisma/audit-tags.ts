/**
 * Read-only audit for tag-integrity drift. Detects three classes of problem so they can
 * be caught before they cause another silent "tag exists on the program page but the
 * dropdown never surfaces it" bug, or a duplicate-meaning filter option:
 *
 *   1. "Twin" pairs -- two Tag rows sharing the same name (case-insensitively) but
 *      different slugs. This is the exact fingerprint of the write-path bug that
 *      minted an uncategorized duplicate whenever a canonical tag's hand-assigned slug
 *      didn't equal slugify(its own name). lib/tags.ts's resolveTagsByName/matchTag now
 *      prevents new ones; this flags any that still exist (a merge missed, or a new
 *      taxonomy tag seeded with a custom slug before this check was run). See
 *      prisma/merge-duplicate-tags.ts for the one-time repair template.
 *   2. Region.memberSlugs entries that don't match any live Tag row -- a region with a
 *      dead member silently returns nothing for that slug.
 *   3. "Near-duplicate" pairs -- a categorized taxonomy tag (e.g. `age-gap-year`,
 *      category `age`) and an uncategorized legacy tag whose slug is the same string
 *      once a category prefix/suffix is stripped (e.g. `gap-year`). Unlike twins, these
 *      have *different* names, so the twin detector above never sees them -- this is
 *      exactly the class of bug that let `gap-year`/`age-gap-year` (135-program
 *      overlap) and `high-school`/`age-high-school` sit undetected for weeks after the
 *      twin-pair fix shipped (see prisma/merge-duplicate-tags.ts's PRE_MERGE_DISCONNECTS
 *      and the gap-year/high-school/girls/11th-grade entries in TAG_MERGES). This is a
 *      string heuristic, not semantic matching -- it won't catch synonym pairs with no
 *      shared substring (e.g. `special-needs`/`disability-inclusion`); those still need
 *      a human skimming the full tag list.
 *
 * Makes no changes. Run any time:
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/audit-tags.ts
 */
import { prisma } from "../lib/prisma";

// Extra non-category affixes seen in the live tag set that don't come from a
// TagCategory slug (e.g. "girls" / "girls-only").
const EXTRA_SUFFIXES = ["-only"];

function stripAffixes(slug: string, categoryPrefixes: string[]): string {
  let core = slug;
  for (const prefix of categoryPrefixes) {
    if (core.startsWith(prefix)) {
      core = core.slice(prefix.length);
      break;
    }
  }
  for (const suffix of EXTRA_SUFFIXES) {
    if (core.endsWith(suffix)) {
      core = core.slice(0, -suffix.length);
      break;
    }
  }
  return core;
}

async function main() {
  const [tags, categories, regions, statusCounts] = await Promise.all([
    prisma.tag.findMany({ include: { _count: { select: { programs: true } } } }),
    prisma.tagCategory.findMany(),
    prisma.region.findMany(),
    prisma.program.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const visibleCategories = new Set(categories.filter((c) => c.showInFilter).map((c) => c.slug));
  const regionReachable = new Set(regions.flatMap((r) => r.memberSlugs));
  const inDropdown = (t: (typeof tags)[number]) =>
    (t.category !== null && visibleCategories.has(t.category)) || regionReachable.has(t.slug);

  console.log("=== Program counts by status ===");
  for (const s of statusCounts) console.log(`  ${s.status}: ${s._count._all}`);

  const byLowerName = new Map<string, typeof tags>();
  for (const t of tags) {
    const key = t.name.toLowerCase();
    const bucket = byLowerName.get(key);
    if (bucket) bucket.push(t);
    else byLowerName.set(key, [t]);
  }
  const twinGroups = Array.from(byLowerName.values()).filter((group) => group.length > 1);

  console.log(`\n=== Twin pairs: same name, different slug (${twinGroups.length}) ===`);
  if (twinGroups.length === 0) console.log("  none");
  for (const group of twinGroups) {
    console.log(`  "${group[0].name}":`);
    for (const t of group) {
      console.log(
        `    ${t.slug}  (${t._count.programs} programs, category=${t.category ?? "none"}, dropdown-reachable=${inDropdown(t)})`
      );
    }
  }

  const categoryPrefixes = categories.map((c) => `${c.slug}-`);
  const byCore = new Map<string, typeof tags>();
  for (const t of tags) {
    const core = stripAffixes(t.slug, categoryPrefixes);
    const bucket = byCore.get(core);
    if (bucket) bucket.push(t);
    else byCore.set(core, [t]);
  }
  const nearDupGroups = Array.from(byCore.values()).filter((group) => group.length > 1);

  console.log(`\n=== Near-duplicate pairs: same core after stripping category prefix/suffix (${nearDupGroups.length}) ===`);
  if (nearDupGroups.length === 0) console.log("  none");
  for (const group of nearDupGroups) {
    console.log(`  core "${stripAffixes(group[0].slug, categoryPrefixes)}":`);
    for (const t of group) {
      console.log(`    ${t.slug}  (name="${t.name}", ${t._count.programs} programs, category=${t.category ?? "none"})`);
    }
  }

  const deadMembers: { region: string; slug: string }[] = [];
  for (const r of regions) {
    for (const slug of r.memberSlugs) {
      if (!tags.some((t) => t.slug === slug)) deadMembers.push({ region: r.slug, slug });
    }
  }
  console.log(`\n=== Region memberSlugs pointing at a nonexistent Tag (${deadMembers.length}) ===`);
  if (deadMembers.length === 0) console.log("  none");
  for (const d of deadMembers) console.log(`  region "${d.region}" -> "${d.slug}"`);

  const unreachable = tags
    .filter((t) => t._count.programs > 0 && !inDropdown(t))
    .sort((a, b) => a._count.programs - b._count.programs);
  console.log(`\n=== Tags carried by programs but unreachable via any dropdown (${unreachable.length}) ===`);
  console.log("(ascending by program count -- the long tail first)");
  for (const t of unreachable) {
    console.log(
      `  ${String(t._count.programs).padStart(4)}  ${t.slug}  ("${t.name}")${t.category ? `  [${t.category}]` : ""}`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
