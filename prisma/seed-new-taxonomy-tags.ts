/**
 * One-time seed that creates the new taxonomy tags for Israeli integration, Religious
 * affiliation, and Essence, and retires the old `population` and legacy `affiliation`
 * tags from the filter bar by recategorizing them to null (uncategorized/general).
 *
 * Old tags are NOT deleted -- they stay attached to programs as general hashtags, and
 * prisma/retag-taxonomy.ts reads them as the confidence signal for the new taxonomy.
 *
 * Run once, after prisma/seed-tag-categories.ts:
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/seed-new-taxonomy-tags.ts
 */
import { prisma } from "../lib/prisma";

const NEW_TAGS: { name: string; slug: string; category: string }[] = [
  // Israeli integration (replaces "Participant mix" / population)
  { name: "High integration", slug: "integration-high", category: "israeli-integration" },
  { name: "Medium integration", slug: "integration-medium", category: "israeli-integration" },
  { name: "Low integration", slug: "integration-low", category: "israeli-integration" },
  { name: "None", slug: "integration-none", category: "israeli-integration" },

  // Religious affiliation (replaces the old orthodox/secular/pluralistic/etc. set)
  { name: "Religious Zionism/Modern Orthodox", slug: "rz-modern-orthodox", category: "affiliation" },
  { name: "Haredi/Ultra-Orthodox", slug: "haredi-ultra-orthodox", category: "affiliation" },
  { name: "Flexible", slug: "flexible", category: "affiliation" },
  { name: "Non-affiliated", slug: "non-affiliated", category: "affiliation" },
  { name: "Mixed", slug: "mixed-affiliation", category: "affiliation" },

  // Essence (new filter category)
  { name: "Spiritual growth", slug: "essence-spiritual-growth", category: "essence" },
  { name: "Academic/Internship", slug: "essence-academic-internship", category: "essence" },
  { name: "Travel", slug: "essence-travel", category: "essence" },
  { name: "Pre-military", slug: "essence-pre-military", category: "essence" },
];

// Old category members to retire from the filter bar (recategorize to null). Left as
// real tags on programs since retag-taxonomy.ts reads them as the mapping signal.
const RETIRE_FROM_CATEGORY = {
  population: ["anglo-only", "israeli-anglo-mix", "israeli-only"],
  affiliation: ["orthodox", "secular", "pluralistic", "conservative", "reform", "chabad", "reconstructionist"],
};

async function main() {
  for (const tag of NEW_TAGS) {
    const result = await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name, category: tag.category },
      create: tag,
    });
    console.log(`upserted tag ${result.slug} [${result.category}]`);
  }

  for (const [oldCategory, slugs] of Object.entries(RETIRE_FROM_CATEGORY)) {
    const result = await prisma.tag.updateMany({
      where: { slug: { in: slugs }, category: oldCategory },
      data: { category: null },
    });
    console.log(`retired ${result.count} tags from category "${oldCategory}" -> null`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
