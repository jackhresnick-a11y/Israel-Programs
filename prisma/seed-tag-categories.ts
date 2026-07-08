/**
 * One-time seed for the new TagCategory registry. Run once after the
 * add_tag_category migration:
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/seed-tag-categories.ts
 *
 * Existing `gender`/`affiliation` Tag.category values already have real tags attached,
 * so they're seeded here too (idempotent upsert) rather than left to implicitly work --
 * SearchBar now reads categories from this table instead of a hardcoded list, so a
 * category with no TagCategory row would silently stop rendering a dropdown.
 * `population` is deliberately NOT seeded -- it's being retired in favor of
 * `israeli-integration` (see prisma/retag-taxonomy.ts). `location` (Region) and
 * `language` (dormant, no UI) are also deliberately not seeded here.
 */
import { prisma } from "../lib/prisma";

const CATEGORIES = [
  { slug: "gender", label: "Gender", tint: "info", order: 1, showInFilter: true },
  { slug: "affiliation", label: "Religious affiliation", tint: "success", order: 2, showInFilter: true },
  { slug: "israeli-integration", label: "Israeli integration", tint: "warning", order: 3, showInFilter: true },
  { slug: "essence", label: "Essence", tint: "violet", order: 4, showInFilter: true },
];

async function main() {
  for (const c of CATEGORIES) {
    const result = await prisma.tagCategory.upsert({
      where: { slug: c.slug },
      update: { label: c.label, tint: c.tint, order: c.order, showInFilter: c.showInFilter },
      create: c,
    });
    console.log(`upserted TagCategory ${result.slug} (${result.label})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
