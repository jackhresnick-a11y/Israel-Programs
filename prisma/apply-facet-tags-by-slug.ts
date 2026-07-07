import { readFileSync } from "fs";
import { join } from "path";
import slugify from "slugify";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

type FacetRow = { slug: string; name: string; add_tags: string[] };

// Same label map as apply-facet-tags.ts, kept in sync by hand since both
// scripts create the same controlled-vocabulary Tag rows.
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

// Unlike apply-facet-tags.ts (which reads data/facet-tags.json, keyed by the
// Program's DB id since that file is only ever produced *after* import),
// batches researched before import can't know an id yet -- their files are
// keyed by slug instead (data/facet-tags-N-by-slug.json). This script
// resolves slug -> id at apply time rather than requiring a separate manual
// resolution pass. See CLAUDE.md's "Adding real programs" section.
async function main() {
  const fileName = process.argv[2];
  if (!fileName) {
    console.error("Usage: tsx prisma/apply-facet-tags-by-slug.ts <facet-tags-N-by-slug.json>");
    process.exit(1);
  }

  const rows = JSON.parse(
    readFileSync(join(__dirname, "..", "data", fileName), "utf-8")
  ) as FacetRow[];

  let programsUpdated = 0;
  let connectionsAdded = 0;
  const notFound: string[] = [];

  for (const row of rows) {
    if (row.add_tags.length === 0) continue;

    const program = await prisma.program.findUnique({ where: { slug: row.slug } });
    if (!program) {
      notFound.push(row.slug);
      continue;
    }

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
      where: { id: program.id },
      data: { tags: { connect: tagIds } }, // connect is additive -- does not remove existing tags
    });
    programsUpdated++;
    connectionsAdded += tagIds.length;
  }

  console.log(`Updated ${programsUpdated} programs with ${connectionsAdded} facet-tag connections.`);
  if (notFound.length) {
    console.log(`\n${notFound.length} slugs matched no program (expected for any deliberately excluded from import):`);
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
