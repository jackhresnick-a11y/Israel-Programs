import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const CATEGORIES: Record<string, string[]> = {
  location: [
    "jerusalem", "tel-aviv", "beer-sheva", "haifa", "negev", "herzliya",
    "ramat-hasharon", "gush-etzion", "hod-hasharon", "modiin", "old-city",
    "old-city-jerusalem", "tzfat", "hebron", "south", "arava-valley",
  ],
  affiliation: [
    "orthodox", "chabad", "conservative", "reform", "reconstructionist",
    "pluralistic", "secular",
  ],
  population: ["israeli-anglo-mix", "anglo-only", "israeli-only"],
  gender: ["coed", "boys-only", "girls-only"],
};

async function main() {
  let updated = 0;

  for (const [category, slugs] of Object.entries(CATEGORIES)) {
    const res = await prisma.tag.updateMany({
      where: { slug: { in: slugs } },
      data: { category },
    });
    console.log(`category=${category}: updated ${res.count}/${slugs.length} tags`);
    updated += res.count;
  }

  // Pre-existing data inconsistency: "mixed-israeli-and-anglo" is a
  // near-duplicate of "israeli-anglo-mix" left over from an external merge
  // of two programs. Merge it onto the canonical slug so the population
  // filter doesn't silently miss that program, then remove the orphan tag.
  const canonical = await prisma.tag.findUnique({ where: { slug: "israeli-anglo-mix" } });
  const duplicate = await prisma.tag.findUnique({
    where: { slug: "mixed-israeli-and-anglo" },
    include: { programs: { select: { id: true, name: true } } },
  });
  if (canonical && duplicate) {
    for (const program of duplicate.programs) {
      await prisma.program.update({
        where: { id: program.id },
        data: { tags: { connect: { id: canonical.id }, disconnect: { id: duplicate.id } } },
      });
      console.log(`merged "mixed-israeli-and-anglo" -> "israeli-anglo-mix" for ${program.name}`);
    }
    await prisma.tag.delete({ where: { id: duplicate.id } });
    console.log('deleted orphan tag "mixed-israeli-and-anglo"');
  }

  console.log(`\nTotal tags categorized: ${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
