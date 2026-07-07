import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

type Entry = { slug: string; confidence: "high" | "medium" | "low"; goodFor: string };

async function main() {
  const fileName = process.argv[2] || "good-for.json";
  const { programs } = JSON.parse(
    readFileSync(join(__dirname, "..", "data", fileName), "utf-8")
  ) as { programs: Entry[] };

  let updated = 0;
  let skippedBlank = 0;
  const notFound: string[] = [];
  const flaggedMedium: string[] = [];

  for (const e of programs) {
    // Only write non-empty text; a blank entry means "left for a human" and
    // must not overwrite anything that's there.
    if (!e.goodFor.trim()) {
      skippedBlank++;
      continue;
    }
    const res = await prisma.program.updateMany({
      where: { slug: e.slug },
      data: { goodFor: e.goodFor.trim() },
    });
    if (res.count === 0) notFound.push(e.slug);
    else updated += res.count;
    if (e.confidence === "medium") flaggedMedium.push(e.slug);
  }

  console.log(`Applied goodFor to ${updated} programs (${skippedBlank} left blank).`);
  if (notFound.length) {
    console.log(`\nWARNING - ${notFound.length} slugs in good-for.json matched no program:`);
    notFound.forEach((s) => console.log("  -", s));
  }
  console.log(
    `\n${flaggedMedium.length} entries are 'medium' confidence (inferred from category, worth a human sanity-check):`
  );
  flaggedMedium.forEach((s) => console.log("  -", s));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
