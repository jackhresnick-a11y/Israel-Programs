import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DURATION_LABELS } from "../lib/duration";
import { REGION_ORDER, REGION_LABELS, REGION_TO_SLUGS } from "../lib/regions";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const durationValues = Object.keys(DURATION_LABELS) as (keyof typeof DURATION_LABELS)[];
  for (let i = 0; i < durationValues.length; i++) {
    const value = durationValues[i];
    await prisma.durationOption.upsert({
      where: { value },
      update: {},
      create: { value, label: DURATION_LABELS[value], order: i, showInFilter: true },
    });
  }
  console.log(`Seeded ${durationValues.length} DurationOption rows (skipped any that already existed).`);

  for (let i = 0; i < REGION_ORDER.length; i++) {
    const slug = REGION_ORDER[i];
    await prisma.region.upsert({
      where: { slug },
      update: {},
      create: { slug, label: REGION_LABELS[slug], order: i, memberSlugs: REGION_TO_SLUGS[slug] },
    });
  }
  console.log(`Seeded ${REGION_ORDER.length} Region rows (skipped any that already existed).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
