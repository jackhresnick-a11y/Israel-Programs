/**
 * One-time seed for the new "Age" filter category (9-12 grade / gap year /
 * college age / after college). Idempotent -- safe to re-run.
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/seed-age-tags.ts
 */
import { prisma } from "../lib/prisma";

const CATEGORY = { slug: "age", label: "Age", tint: "accent", order: 5, showInFilter: true };

const TAGS: { name: string; slug: string; category: string; order: number }[] = [
  { name: "9-12 grade", slug: "age-high-school", category: "age", order: 1 },
  { name: "Gap year (post-high school)", slug: "age-gap-year", category: "age", order: 2 },
  { name: "College age", slug: "age-college", category: "age", order: 3 },
  { name: "After college", slug: "age-post-college", category: "age", order: 4 },
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
