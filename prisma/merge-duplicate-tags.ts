/**
 * One-time repair for the write-path bug that silently created uncategorized duplicate
 * ("twin") tags whenever a program was saved with a taxonomy tag whose canonical slug
 * isn't slugify(its own name) -- e.g. slug `integration-low`, name "Low integration".
 * `resolveTagsByName`/`matchTag` in lib/tags.ts now stop new duplicates from being
 * minted; this script cleans up the ones that already exist in the live data. See
 * prisma/audit-tags.ts for the read-only detector this script's tables were derived
 * from.
 *
 * Both tables below are a literal, hand-reviewed mapping -- nothing here is inferred or
 * fuzzy-matched. Review them before running --commit.
 *
 * TAG_MERGES repoints every program on a duplicate ("source") tag onto its canonical
 * ("target") tag and deletes the duplicate, via lib/tags.ts's `mergeTags` -- the same
 * helper the admin Tag manager uses for this exact operation, so there is no new merge
 * logic here.
 *
 * REGION_REPAIR fixes `Region.memberSlugs`, which (aside from `jerusalem` and
 * `ramat-hasharon`) reference a location-tag vocabulary that no longer exists in the
 * DB. It recategorizes the live geography tags programs actually carry to
 * `category: "location"` and rewrites each Region's members to point at them. Judea is
 * deliberately left empty -- `yehuda-desert` and `central-israel` both exist but
 * weren't confidently assigned to a region (open call, see the plan) -- matching the
 * existing precedent of Samaria having shipped with zero members until now.
 *
 * Two-phase, like the other prisma/*.ts scripts in this repo. The backup file is
 * written BEFORE any mutation, on every run (dry or commit), so a dry run doubles as a
 * point-in-time snapshot:
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/merge-duplicate-tags.ts --dry-run
 *   # review the printed plan + data/tag-merge-backup-<date>.json, then:
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/merge-duplicate-tags.ts --commit
 *
 * --dry-run is the default if neither flag is passed. Safe to re-run: a source tag,
 * recategorize target, or Region already fixed by a prior run is skipped, not
 * re-applied or errored on.
 *
 * PRE_MERGE_DISCONNECTS handles a second, unrelated class of duplicate: the legacy
 * freeform "gap-year" tag and the categorized "age-gap-year" tag both mean the same
 * thing on ~135 programs (135 carry both), but that same-name merge would be wrong for
 * 6 grad/professional programs (HUC-JIR Year-in-Israel, JTS Israel Year, Israel Tech
 * Challenge Fellows, New Israel Fund/Shatil Fellowship, OTZMA, Pardes Year/Semester)
 * that were never gap-year programs in the first place -- they get "gap-year"
 * disconnected outright, not converted to "age-gap-year", before the general merge
 * below runs. The remaining 4 programs that carry "gap-year" without "age-gap-year"
 * (Bat Ayin Yeshiva, Machon Shlomo, Machon Yaakov, Mayanot Women's Program) genuinely
 * are gap-year programs and need no special handling -- the merge naturally adds
 * "age-gap-year" to them like everyone else still holding "gap-year".
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { mergeTags } from "../lib/tags";

const PRE_MERGE_DISCONNECTS: { tagSlug: string; programSlugs: string[] }[] = [
  {
    tagSlug: "gap-year",
    programSlugs: [
      "huc-jir-year-in-israel",
      "jts-israel-year",
      "israel-tech-challenge-fellows-program",
      "new-israel-fund-shatil-social-justice-fellowship",
      "otzma",
      "pardes-institute-of-jewish-studies-yearsemester-program",
    ],
  },
];

const TAG_MERGES: { source: string; target: string }[] = [
  { source: "high-integration", target: "integration-high" },
  { source: "medium-integration", target: "integration-medium" },
  { source: "low-integration", target: "integration-low" },
  { source: "religious-zionismmodern-orthodox", target: "rz-modern-orthodox" },
  { source: "spiritual-growth", target: "essence-spiritual-growth" },
  { source: "academicinternship", target: "essence-academic-internship" },
  { source: "pre-military", target: "essence-pre-military" },
  { source: "travel", target: "essence-travel" },
  { source: "gap-year-post-high-school", target: "age-gap-year" },
  { source: "gap-year", target: "age-gap-year" },
  { source: "high-school", target: "age-high-school" },
  { source: "girls", target: "girls-only" },
  { source: "gap-year-after-highschool", target: "age-gap-year" },
  { source: "11th-grade", target: "age-high-school" },
];

// Existing general (uncategorized) tags to recategorize -- the live geography
// vocabulary programs actually carry. Region.memberSlugs (below) points at these
// instead of the stale slugs (haifa, tel-aviv, negev, ...) that no longer exist as Tag
// rows. `central-israel` and `yehuda-desert` are deliberately excluded (see header).
const RECATEGORIZE_TO_LOCATION = ["northern-israel", "southern-israel", "coastal-israel", "samaria"];

// Region slug -> full replacement memberSlugs list.
const REGION_REPAIR: Record<string, string[]> = {
  north: ["northern-israel"],
  south: ["southern-israel"],
  jerusalem: ["jerusalem"],
  judea: [],
  samaria: ["samaria"],
  coast: ["coastal-israel", "ramat-hasharon"],
};

type TagBackupRow = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  order: number;
  programIds: string[];
};

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  // --- Gather phase: read everything, mutate nothing yet. ---
  const disconnectPlan: { tagId: string; tagSlug: string; programId: string; programSlug: string }[] = [];
  const skippedDisconnects: string[] = [];
  for (const { tagSlug, programSlugs } of PRE_MERGE_DISCONNECTS) {
    const tag = await prisma.tag.findUnique({ where: { slug: tagSlug } });
    if (!tag) {
      skippedDisconnects.push(`"${tagSlug}": tag not found (already merged?)`);
      continue;
    }
    for (const programSlug of programSlugs) {
      const program = await prisma.program.findUnique({
        where: { slug: programSlug },
        select: { id: true, tags: { select: { slug: true } } },
      });
      if (!program) {
        skippedDisconnects.push(`"${programSlug}": program not found`);
        continue;
      }
      if (!program.tags.some((t) => t.slug === tagSlug)) {
        skippedDisconnects.push(`"${programSlug}": doesn't carry "${tagSlug}" (already fixed?)`);
        continue;
      }
      disconnectPlan.push({ tagId: tag.id, tagSlug, programId: program.id, programSlug });
    }
  }

  const mergePlan: { source: TagBackupRow; targetId: string; targetSlug: string }[] = [];
  const skippedMerges: string[] = [];

  for (const { source, target } of TAG_MERGES) {
    const [sourceTag, targetTag] = await Promise.all([
      prisma.tag.findUnique({
        where: { slug: source },
        include: { programs: { select: { id: true } } },
      }),
      prisma.tag.findUnique({ where: { slug: target } }),
    ]);
    if (!sourceTag) {
      skippedMerges.push(`"${source}" -> "${target}": source not found (already merged?)`);
      continue;
    }
    if (!targetTag) {
      skippedMerges.push(`"${source}" -> "${target}": TARGET NOT FOUND -- check the canonical slug`);
      continue;
    }
    mergePlan.push({
      source: {
        id: sourceTag.id,
        name: sourceTag.name,
        slug: sourceTag.slug,
        category: sourceTag.category,
        order: sourceTag.order,
        programIds: sourceTag.programs.map((p) => p.id),
      },
      targetId: targetTag.id,
      targetSlug: targetTag.slug,
    });
  }

  const recategorizePlan: TagBackupRow[] = [];
  const skippedRecategorize: string[] = [];
  for (const slug of RECATEGORIZE_TO_LOCATION) {
    const tag = await prisma.tag.findUnique({ where: { slug }, include: { programs: { select: { id: true } } } });
    if (!tag) {
      skippedRecategorize.push(`"${slug}": not found`);
      continue;
    }
    recategorizePlan.push({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      category: tag.category,
      order: tag.order,
      programIds: tag.programs.map((p) => p.id),
    });
  }

  const regionPlan: { slug: string; before: string[]; after: string[] }[] = [];
  const skippedRegions: string[] = [];
  for (const [slug, memberSlugs] of Object.entries(REGION_REPAIR)) {
    const region = await prisma.region.findUnique({ where: { slug } });
    if (!region) {
      skippedRegions.push(`"${slug}": not found`);
      continue;
    }
    regionPlan.push({ slug, before: region.memberSlugs, after: memberSlugs });
  }

  // --- Report ---
  console.log(`\n=== Pre-merge disconnects (wrongly-tagged programs losing a tag outright) ===`);
  for (const d of disconnectPlan) console.log(`  "${d.programSlug}": remove "${d.tagSlug}"`);
  for (const s of skippedDisconnects) console.log(`  [skip] ${s}`);

  console.log(`\n=== Tag merges (${commit ? "COMMIT" : "dry run"}) ===`);
  for (const m of mergePlan) {
    console.log(
      `  "${m.source.slug}" (${m.source.programIds.length} programs, category=${m.source.category ?? "none"}) -> "${m.targetSlug}"`
    );
  }
  for (const s of skippedMerges) console.log(`  [skip] ${s}`);

  console.log(`\n=== Recategorize to "location" ===`);
  for (const r of recategorizePlan) console.log(`  "${r.slug}": ${r.category ?? "(none)"} -> location`);
  for (const s of skippedRecategorize) console.log(`  [skip] ${s}`);

  console.log(`\n=== Region memberSlugs repair ===`);
  for (const r of regionPlan) console.log(`  "${r.slug}": [${r.before.join(", ")}] -> [${r.after.join(", ")}]`);
  for (const s of skippedRegions) console.log(`  [skip] ${s}`);

  // --- Backup: written before any mutation, every run. ---
  const backupPath = `data/tag-merge-backup-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify(
      { disconnects: disconnectPlan, mergedTags: mergePlan.map((m) => m.source), recategorizedTags: recategorizePlan, regions: regionPlan },
      null,
      2
    )
  );
  console.log(`\nPre-change state written to ${backupPath}`);

  if (!commit) {
    console.log("\nDry run only -- no changes written. Re-run with --commit to apply.");
    return;
  }

  // --- Mutate phase ---
  console.log("\nApplying...");
  // Disconnects must run before the merges below -- gap-year's merge reassigns
  // age-gap-year onto every program still carrying gap-year, so the 6 wrongly-tagged
  // programs need it removed first, not converted.
  for (const d of disconnectPlan) {
    await prisma.program.update({ where: { id: d.programId }, data: { tags: { disconnect: { id: d.tagId } } } });
  }
  for (const m of mergePlan) {
    await mergeTags(m.source.id, m.targetId);
  }
  for (const r of recategorizePlan) {
    await prisma.tag.update({ where: { id: r.id }, data: { category: "location" } });
  }
  for (const r of regionPlan) {
    await prisma.region.update({ where: { slug: r.slug }, data: { memberSlugs: r.after } });
  }
  console.log(
    `Done. Disconnected ${disconnectPlan.length} tag links, merged ${mergePlan.length} tags, recategorized ${recategorizePlan.length} tags, repaired ${regionPlan.length} regions.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
