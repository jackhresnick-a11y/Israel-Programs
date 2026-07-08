/**
 * Retags existing programs into the new Israeli-integration / Religious-affiliation /
 * Essence taxonomy, using each program's existing tags as the confidence signal.
 * Deliberately conservative: a program only gets a new tag when a strong signal tag is
 * present; anything ambiguous is left blank rather than guessed.
 *
 * Two-phase, like the other prisma/apply-*.ts scripts in this repo:
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/retag-taxonomy.ts --dry-run
 *   # review the printed summary + data/retag-preview.json, then:
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/retag-taxonomy.ts --commit
 *
 * --dry-run is the default if neither flag is passed.
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

// -- Israeli integration -----------------------------------------------------------
// Signal: the old `population` tags (now uncategorized, kept for this exact purpose).
const INTEGRATION_MAP: Record<string, string> = {
  "israeli-only": "integration-high",
  "israeli-anglo-mix": "integration-medium",
  "anglo-only": "integration-low",
};

// -- Religious affiliation ----------------------------------------------------------
// Signal buckets from the old `affiliation` tags (now uncategorized) plus general tags
// that unambiguously indicate one of the five new categories. A program matching >=2
// distinct buckets becomes "Mixed". Bare "orthodox" alone is NOT a bucket signal --
// it's ambiguous between RZ/Modern Orthodox and Haredi and is left blank on purpose.
const AFFILIATION_BUCKETS: Record<string, string[]> = {
  // "hesder" (yeshiva + IDF service track) is definitionally Religious Zionist --
  // Haredi yeshivas don't run Hesder programs.
  "rz-modern-orthodox": ["modern-orthodox", "religious-zionist", "bnei-akiva", "hesder"],
  // "yeshiva-gevoha" deliberately excluded: it's a generic "advanced yeshiva" term, not
  // Haredi-specific -- its one real occurrence in the data is on Merkaz HaRav, a
  // flagship Religious Zionist yeshiva, so treating it as a Haredi signal produced a
  // false "Mixed" result there.
  "haredi-ultra-orthodox": ["haredi", "litvish", "chabad"],
  flexible: [
    "pluralistic",
    "pluralist",
    "pluralistic-judaism",
    "masorti",
    "conservative",
    "reform",
    "reconstructionist",
    "ramah",
    "non-denominational",
    "conservative-movement",
  ],
  "non-affiliated": ["secular"],
};

// -- Essence (multi-select; a program may land in several) --------------------------
const ESSENCE_BUCKETS: Record<string, string[]> = {
  "essence-spiritual-growth": [
    "yeshiva",
    "seminary",
    "torah-study",
    "mens-learning",
    "womens-learning",
    "religious",
  ],
  "essence-academic-internship": [
    "university",
    "internship",
    "academic",
    "academics",
    "study-abroad",
    "medical",
    "medical-school",
    "tech",
    "engineering",
    "post-grad",
    "fellowship",
    "business",
    "science",
    "nursing",
    "hospital",
    "career",
  ],
  "essence-travel": ["israel-trip", "birthright", "hiking", "israel-seminar", "multi-city-touring", "poland-israel"],
  "essence-pre-military": ["mechina", "pre-army", "idf", "army", "national-service", "sherut-leumi", "hesder", "lone-soldier"],
};

type ProgramRow = { id: string; slug: string; name: string; tagSlugs: Set<string> };

type ProposedTags = {
  integration: string | null;
  affiliation: string | null;
  essence: string[];
};

function computeIntegration(tagSlugs: Set<string>): string | null {
  for (const [signalSlug, targetSlug] of Object.entries(INTEGRATION_MAP)) {
    if (tagSlugs.has(signalSlug)) return targetSlug;
  }
  return null;
}

function computeAffiliation(tagSlugs: Set<string>): string | null {
  const matchedBuckets = Object.entries(AFFILIATION_BUCKETS)
    .filter(([, signals]) => signals.some((s) => tagSlugs.has(s)))
    .map(([bucket]) => bucket);

  if (matchedBuckets.length === 0) return null;
  if (matchedBuckets.length === 1) return matchedBuckets[0];
  return "mixed-affiliation";
}

function computeEssence(tagSlugs: Set<string>): string[] {
  return Object.entries(ESSENCE_BUCKETS)
    .filter(([, signals]) => signals.some((s) => tagSlugs.has(s)))
    .map(([bucket]) => bucket);
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  const programs = await prisma.program.findMany({
    select: { id: true, slug: true, name: true, tags: { select: { slug: true } } },
  });

  const rows: ProgramRow[] = programs.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    tagSlugs: new Set(p.tags.map((t) => t.slug)),
  }));

  const proposals = new Map<string, ProposedTags>();
  for (const row of rows) {
    proposals.set(row.id, {
      integration: computeIntegration(row.tagSlugs),
      affiliation: computeAffiliation(row.tagSlugs),
      essence: computeEssence(row.tagSlugs),
    });
  }

  // --- Summary ---
  const integrationCounts = new Map<string, number>();
  const affiliationCounts = new Map<string, number>();
  const essenceCounts = new Map<string, number>();
  let integrationBlank = 0;
  let affiliationBlank = 0;
  let essenceBlank = 0;

  for (const proposal of proposals.values()) {
    if (proposal.integration) {
      integrationCounts.set(proposal.integration, (integrationCounts.get(proposal.integration) ?? 0) + 1);
    } else {
      integrationBlank++;
    }
    if (proposal.affiliation) {
      affiliationCounts.set(proposal.affiliation, (affiliationCounts.get(proposal.affiliation) ?? 0) + 1);
    } else {
      affiliationBlank++;
    }
    if (proposal.essence.length > 0) {
      for (const tag of proposal.essence) {
        essenceCounts.set(tag, (essenceCounts.get(tag) ?? 0) + 1);
      }
    } else {
      essenceBlank++;
    }
  }

  console.log(`\n=== Retag summary (${rows.length} programs) ===`);
  console.log("\nIsraeli integration:");
  for (const [tag, count] of integrationCounts) console.log(`  ${tag}: ${count}`);
  console.log(`  (blank): ${integrationBlank}`);

  console.log("\nReligious affiliation:");
  for (const [tag, count] of affiliationCounts) console.log(`  ${tag}: ${count}`);
  console.log(`  (blank): ${affiliationBlank}`);

  console.log("\nEssence (multi-select, counts are per-tag not per-program):");
  for (const [tag, count] of essenceCounts) console.log(`  ${tag}: ${count}`);
  console.log(`  (no essence tag at all): ${essenceBlank}`);

  const previewPath = "data/retag-preview.json";
  const preview = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    existingTags: Array.from(row.tagSlugs).sort(),
    proposed: proposals.get(row.id),
  }));
  writeFileSync(previewPath, JSON.stringify(preview, null, 2));
  console.log(`\nFull per-program proposal written to ${previewPath}`);

  if (!commit) {
    console.log("\nDry run only -- no changes written. Re-run with --commit to apply.");
    return;
  }

  console.log("\nApplying...");
  let applied = 0;
  for (const row of rows) {
    const proposal = proposals.get(row.id)!;
    const connectSlugs = [proposal.integration, proposal.affiliation, ...proposal.essence].filter(
      (s): s is string => Boolean(s)
    );
    if (connectSlugs.length === 0) continue;
    await prisma.program.update({
      where: { id: row.id },
      data: { tags: { connect: connectSlugs.map((slug) => ({ slug })) } },
    });
    applied++;
  }
  console.log(`Done. Updated ${applied} programs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
