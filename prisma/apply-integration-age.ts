/**
 * Applies the researched Israeli-integration level and age-eligibility tags
 * from data/integration-age-research.json (see prisma/_export-for-research.ts
 * for how that research input was generated, and the research pass itself).
 *
 * Unlike prisma/apply-facet-tags-by-slug.ts (pure additive connect), this
 * script REPLACES a program's israeli-integration tag: it disconnects
 * whichever of the four integration tags is currently attached (if any)
 * before connecting the new one, so a program never ends up wearing two
 * contradictory integration tags. Age tags are connected additively.
 *
 * Defaults to a dry run (prints a summary + writes a preview file, makes no
 * DB writes). Pass --commit to actually apply.
 *
 *   set -a && source .env && source .env.local && set +a
 *   npx tsx prisma/apply-integration-age.ts --dry-run
 *   npx tsx prisma/apply-integration-age.ts --commit
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const INTEGRATION_TAGS = [
  "integration-high",
  "integration-medium",
  "integration-low",
  "no-israeli-integration",
] as const;
type IntegrationTag = (typeof INTEGRATION_TAGS)[number];

const AGE_TAGS = ["age-high-school", "age-gap-year", "age-college", "age-post-college"] as const;
type AgeTag = (typeof AGE_TAGS)[number];

type ResearchRow = {
  slug: string;
  name: string;
  integrationTag: IntegrationTag | null;
  ageTags: AgeTag[];
  confidence: "high" | "medium" | "low";
  evidence: string;
};

async function main() {
  const commit = process.argv.includes("--commit");

  const rows = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "integration-age-research.json"), "utf-8")
  ) as ResearchRow[];

  const integrationTagIds = new Map<string, string>();
  for (const slug of INTEGRATION_TAGS) {
    const tag = await prisma.tag.findUnique({ where: { slug } });
    if (!tag) throw new Error(`Missing expected tag "${slug}" -- run prisma/seed-new-taxonomy-tags.ts first`);
    integrationTagIds.set(slug, tag.id);
  }
  const ageTagIds = new Map<string, string>();
  for (const slug of AGE_TAGS) {
    const tag = await prisma.tag.findUnique({ where: { slug } });
    if (!tag) throw new Error(`Missing expected tag "${slug}" -- run prisma/seed-age-tags.ts first`);
    ageTagIds.set(slug, tag.id);
  }

  const notFound: string[] = [];
  const lowConfidence: { slug: string; name: string; evidence: string }[] = [];
  const preview: {
    slug: string;
    name: string;
    integrationChange: string | null;
    ageTagsAdded: string[];
    confidence: string;
  }[] = [];
  let integrationChanged = 0;
  let ageTagsAdded = 0;
  const integrationCounts: Record<IntegrationTag, number> = {
    "integration-high": 0,
    "integration-medium": 0,
    "integration-low": 0,
    "no-israeli-integration": 0,
  };

  for (const row of rows) {
    const program = await prisma.program.findUnique({
      where: { slug: row.slug },
      include: { tags: { where: { category: "israeli-integration" } } },
    });
    if (!program) {
      notFound.push(row.slug);
      continue;
    }

    if (row.confidence === "low") {
      lowConfidence.push({ slug: row.slug, name: row.name, evidence: row.evidence });
    }

    let integrationChange: string | null = null;
    if (row.integrationTag) {
      integrationCounts[row.integrationTag]++;
      const current = program.tags[0]?.slug;
      if (current !== row.integrationTag) {
        integrationChange = `${current ?? "(none)"} -> ${row.integrationTag}`;
        integrationChanged++;
        if (commit) {
          const disconnect = program.tags.map((t) => ({ id: t.id }));
          await prisma.program.update({
            where: { id: program.id },
            data: {
              tags: {
                ...(disconnect.length > 0 ? { disconnect } : {}),
                connect: { id: integrationTagIds.get(row.integrationTag)! },
              },
            },
          });
        }
      }
    }

    if (row.ageTags.length > 0) {
      ageTagsAdded += row.ageTags.length;
      if (commit) {
        await prisma.program.update({
          where: { id: program.id },
          data: { tags: { connect: row.ageTags.map((slug) => ({ id: ageTagIds.get(slug)! })) } },
        });
      }
    }

    preview.push({
      slug: row.slug,
      name: row.name,
      integrationChange,
      ageTagsAdded: row.ageTags,
      confidence: row.confidence,
    });
  }

  writeFileSync(
    join(__dirname, "..", "data", "integration-age-preview.json"),
    JSON.stringify(preview, null, 2)
  );

  console.log(commit ? "COMMITTED changes:" : "DRY RUN (no changes written; pass --commit to apply):");
  console.log(`  Programs with an integration change: ${integrationChanged}`);
  console.log(`  Age-tag connections added: ${ageTagsAdded}`);
  console.log(`  Final integration tag distribution: ${JSON.stringify(integrationCounts)}`);
  console.log(`  Preview written to data/integration-age-preview.json`);

  if (notFound.length) {
    console.log(`\n${notFound.length} slugs matched no program:`);
    notFound.forEach((s) => console.log("  -", s));
  }
  if (lowConfidence.length) {
    console.log(`\n${lowConfidence.length} LOW CONFIDENCE rows -- recommend admin review:`);
    lowConfidence.forEach((r) => console.log(`  - ${r.slug}: ${r.evidence}`));
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
