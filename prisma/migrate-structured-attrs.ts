import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function backfillBoolean(slug: string, field: "hasScholarship" | "hasCollegeCredit") {
  const tag = await prisma.tag.findUnique({ where: { slug }, include: { programs: { select: { id: true } } } });
  if (!tag) {
    console.log(`tag "${slug}" not found, skipping`);
    return;
  }
  for (const program of tag.programs) {
    await prisma.program.update({ where: { id: program.id }, data: { [field]: true } });
  }
  console.log(`${field}: set true on ${tag.programs.length} programs (from tag "${slug}")`);
}

async function backfillTravelType(slug: string, value: "SINGLE_LOCATION" | "MULTI_CITY_TOURING") {
  const tag = await prisma.tag.findUnique({ where: { slug }, include: { programs: { select: { id: true } } } });
  if (!tag) {
    console.log(`tag "${slug}" not found, skipping`);
    return;
  }
  for (const program of tag.programs) {
    await prisma.program.update({ where: { id: program.id }, data: { travelType: value } });
  }
  console.log(`travelType: set ${value} on ${tag.programs.length} programs (from tag "${slug}")`);
}

async function main() {
  await backfillBoolean("scholarships-available", "hasScholarship");
  await backfillBoolean("college-credit", "hasCollegeCredit");
  await backfillTravelType("single-location", "SINGLE_LOCATION");
  await backfillTravelType("multi-city-touring", "MULTI_CITY_TOURING");

  const withoutTravel = await prisma.program.count({ where: { travelType: null } });
  console.log(`\nprograms still missing travelType after backfill: ${withoutTravel}`);

  const del = await prisma.tag.deleteMany({
    where: { slug: { in: ["scholarships-available", "college-credit", "single-location", "multi-city-touring"] } },
  });
  console.log(`deleted ${del.count} now-obsolete Tag rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
