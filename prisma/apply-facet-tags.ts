import { readFileSync } from "fs";
import { join } from "path";
import slugify from "slugify";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

type FacetRow = { id: string; name: string; add_tags: string[] };

// Human-readable labels for the new controlled-vocabulary tags, used only to
// set Tag.name the first time each slug is created (upsert is a no-op after that).
const LABELS: Record<string, string> = {
  coed: "Co-ed",
  "boys-only": "Boys only",
  "girls-only": "Girls only",
  orthodox: "Orthodox",
  chabad: "Chabad",
  conservative: "Conservative",
  reform: "Reform",
  reconstructionist: "Reconstructionist",
  pluralistic: "Pluralistic",
  secular: "Secular / Non-denominational",
  "scholarships-available": "Scholarships available",
  "college-credit": "College credit available",
  "single-location": "Single location",
  "multi-city-touring": "Multi-city / touring",
  "israeli-anglo-mix": "Mixed Israeli & Anglo",
  "anglo-only": "Anglo only",
  "israeli-only": "Israeli only",
  "spanish-speaking": "Spanish-speaking",
};

async function main() {
  const rows = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "facet-tags.json"), "utf-8")
  ) as FacetRow[];

  let programsUpdated = 0;
  let connectionsAdded = 0;

  for (const row of rows) {
    if (row.add_tags.length === 0) continue;

    const tagIds = await Promise.all(
      row.add_tags.map(async (slug) => {
        const tag = await prisma.tag.upsert({
          where: { slug },
          update: {},
          create: { name: LABELS[slug] ?? slug, slug: slugify(slug, { lower: true, strict: true }) },
        });
        return { id: tag.id };
      })
    );

    await prisma.program.update({
      where: { id: row.id },
      data: { tags: { connect: tagIds } }, // connect is additive -- does not remove existing tags
    });
    programsUpdated++;
    connectionsAdded += tagIds.length;
  }

  console.log(`Updated ${programsUpdated} programs with ${connectionsAdded} facet-tag connections.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
