/**
 * One-time fix for the display order of the Religious-affiliation and Essence tag
 * options (both dropdown filters and the tag picker) -- Tag.order defaults to 0 for
 * every tag created so far, so they were falling back to alphabetical (the name-based
 * tiebreak in listAllTags's orderBy).
 *
 * Run once:
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/reorder-taxonomy-tags.ts
 */
import { prisma } from "../lib/prisma";

const ORDER: { slug: string; order: number }[] = [
  // Religious affiliation
  { slug: "rz-modern-orthodox", order: 0 },
  { slug: "haredi-ultra-orthodox", order: 1 },
  { slug: "flexible", order: 2 },
  { slug: "non-affiliated", order: 3 },
  { slug: "mixed-affiliation", order: 4 },

  // Essence
  { slug: "essence-spiritual-growth", order: 0 },
  { slug: "essence-academic-internship", order: 1 },
  { slug: "essence-travel", order: 2 },
  { slug: "essence-pre-military", order: 3 },
];

async function main() {
  for (const { slug, order } of ORDER) {
    const result = await prisma.tag.updateMany({ where: { slug }, data: { order } });
    console.log(`${slug} -> order ${order} (${result.count} row${result.count === 1 ? "" : "s"})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
