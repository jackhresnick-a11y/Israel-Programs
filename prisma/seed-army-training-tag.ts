/**
 * One-time seed that adds the "Army training" tag to the essence filter category, for
 * pre-army physical/mental preparation groups (kosher kravi) -- distinct from the
 * existing "Pre-military" essence tag, which is used by gap-year mechina/hesder
 * programs rather than standalone fitness-training groups.
 *
 * Run once:
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/seed-army-training-tag.ts
 */
import { prisma } from "../lib/prisma";

async function main() {
  const result = await prisma.tag.upsert({
    where: { slug: "essence-army-training" },
    update: { name: "Army training", category: "essence" },
    create: { name: "Army training", slug: "essence-army-training", category: "essence" },
  });
  console.log(`upserted tag ${result.slug} [${result.category}]`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
