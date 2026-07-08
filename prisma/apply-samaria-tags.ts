import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// The "samaria" region in lib/regions.ts previously mapped to zero location
// tags, and none of these programs had a location tag at all -- so the
// Samaria filter was a silent no-op regardless. This backfills the missing
// town-level location tags (matching the existing city-level convention:
// haifa, tzfat, gush-etzion, hebron, etc.) and attaches each to its program.
const ROWS: { slug: string; tagSlug: string; tagName: string }[] = [
  { slug: "mechinat-bnei-david-eli", tagSlug: "eli", tagName: "Eli" },
  { slug: "ariel-university-international-program", tagSlug: "ariel", tagName: "Ariel" },
  { slug: "shiloh-excavations", tagSlug: "shiloh", tagName: "Shiloh" },
];

async function main() {
  let programsUpdated = 0;
  const notFound: string[] = [];

  for (const row of ROWS) {
    const program = await prisma.program.findUnique({ where: { slug: row.slug } });
    if (!program) {
      notFound.push(row.slug);
      continue;
    }

    const tag = await prisma.tag.upsert({
      where: { slug: row.tagSlug },
      update: { category: "location" },
      create: { slug: row.tagSlug, name: row.tagName, category: "location" },
    });

    await prisma.program.update({
      where: { id: program.id },
      data: { tags: { connect: { id: tag.id } } }, // connect is additive
    });
    programsUpdated++;
  }

  console.log(`Updated ${programsUpdated} programs with Samaria location tags.`);
  if (notFound.length) {
    console.log(`\n${notFound.length} slugs matched no program:`);
    notFound.forEach((s) => console.log("  -", s));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
