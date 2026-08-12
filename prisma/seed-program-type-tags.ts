/**
 * One-time seed for the new "Program type" tag category, backing /match v2's Q6
 * (find-v2-question-spec.md's flagship question -- "the split that matters more than
 * anything else on this page"). Idempotent -- safe to re-run.
 *
 * As of this seed, zero PUBLISHED programs carry any of these eight tags: only 7 of
 * 90 mechina-tagged programs carry any religious-affiliation tag at all, and no
 * `seminary`/`midrasha` tag exists anywhere in the live taxonomy to derive a proxy
 * from (verified against production -- see CLAUDE.md's "/find v2" section). Rather
 * than point Q6 at an unreliable proxy (girls-only + essence-spiritual-growth, which
 * plenty of non-seminary programs also carry), these are real, purpose-built tags
 * that simply have no programs on them yet. Q6 will contribute nothing to /match's
 * ranking until a separate backfill pass tags the catalog -- deliberate, and
 * surfaced as a standing count on /admin/flow/questions rather than hidden behind a
 * guess. showInFilter starts FALSE: an always-empty option in the public /programs
 * filter bar would be worse than no option at all; flip it on once real programs
 * carry these tags.
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/seed-program-type-tags.ts
 */
import { prisma } from "../lib/prisma";

const CATEGORY = { slug: "program-type", label: "Program type", tint: "accent", order: 6, showInFilter: false };

const TAGS: { name: string; slug: string; category: string; order: number }[] = [
  { name: "Israeli yeshiva", slug: "israeli-yeshiva", category: "program-type", order: 1 },
  { name: "American/English-language yeshiva", slug: "american-yeshiva", category: "program-type", order: 2 },
  { name: "Israeli midrasha", slug: "israeli-midrasha", category: "program-type", order: 3 },
  { name: "American seminary", slug: "american-seminary", category: "program-type", order: 4 },
  { name: "Religious mechina", slug: "religious-mechina", category: "program-type", order: 5 },
  { name: "Regular/non-religious mechina", slug: "regular-mechina", category: "program-type", order: 6 },
  { name: "Academic (college credit)", slug: "academic-college-credit", category: "program-type", order: 7 },
  { name: "Experience / travel-focused", slug: "experience-travel", category: "program-type", order: 8 },
];

async function main() {
  const category = await prisma.tagCategory.upsert({
    where: { slug: CATEGORY.slug },
    update: { label: CATEGORY.label, tint: CATEGORY.tint, order: CATEGORY.order, showInFilter: CATEGORY.showInFilter },
    create: CATEGORY,
  });
  console.log(`upserted TagCategory ${category.slug} (${category.label})`);

  for (const tag of TAGS) {
    const result = await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name, category: tag.category, order: tag.order },
      create: tag,
    });
    console.log(`upserted tag ${result.slug} [${result.category}]`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
