/**
 * Read-only tag audit: for every PUBLISHED program, dumps its current tag/duration/region
 * state to a CSV with reviewer/notes columns, so a human can work the program-type/essence
 * backfill backlog in a spreadsheet. Never writes to the DB -- this is the input to a
 * later, separate backfill pass, not the backfill itself.
 *
 * proposed_type/proposed_essence start pre-filled with each program's current values
 * (same pipe-joined format as current_type/current_essence), not blank. The importer
 * (scripts/import-tag-audit.ts) replaces the full tag set within a category from
 * whatever survives in the proposed cell, so a blank cell there means "remove
 * everything in this category" -- pre-filling means that only happens when a reviewer
 * deliberately clears it, not by leaving a cell untouched.
 *
 * MODIFIES NOTHING. Run:
 *   set -a && source .env && source .env.local && set +a
 *   npx tsx scripts/export-tag-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { getDurationLabelMap } from "../lib/duration";
import { listRegions } from "../lib/regions";

const LISTING_BASE_URL = "https://israelprogramswiki.com/programs";

const FAMILY = {
  type: "program-type",
  essence: "essence",
  gender: "gender",
  affiliation: "affiliation",
  integration: "israeli-integration",
  location: "location",
} as const;

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function slugsIn(tags: { slug: string; category: string | null }[], category: string): string {
  return tags
    .filter((t) => t.category === category)
    .map((t) => t.slug)
    .sort()
    .join("|");
}

async function main() {
  const programs = await prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      name: true,
      slug: true,
      durationType: true,
      tags: { select: { slug: true, category: true } },
    },
    orderBy: { name: "asc" },
  });

  const durationLabels = await getDurationLabelMap();
  const regions = await listRegions();

  const rows = programs.map((p) => {
    const locationSlugs = new Set(slugsIn(p.tags, FAMILY.location).split("|").filter(Boolean));
    const regionSlugs = regions
      .filter((r) => r.memberSlugs.some((s) => locationSlugs.has(s)))
      .map((r) => r.slug);
    const currentType = slugsIn(p.tags, FAMILY.type);
    const currentEssence = slugsIn(p.tags, FAMILY.essence);

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      url: `${LISTING_BASE_URL}/${p.slug}`,
      current_type: currentType,
      current_essence: currentEssence,
      current_duration: durationLabels[p.durationType],
      current_gender: slugsIn(p.tags, FAMILY.gender),
      current_religious_affiliation: slugsIn(p.tags, FAMILY.affiliation),
      current_israeli_integration: slugsIn(p.tags, FAMILY.integration),
      current_region: regionSlugs.join("|"),
      // Pre-filled with the current value, not blank -- see header comment.
      proposed_type: currentType,
      proposed_essence: currentEssence,
      reviewer: "",
      notes: "",
    };
  });

  // Programs missing a type tag first, then alphabetical by name -- stable across runs.
  rows.sort((a, b) => {
    const missingA = a.current_type === "" ? 0 : 1;
    const missingB = b.current_type === "" ? 0 : 1;
    if (missingA !== missingB) return missingA - missingB;
    return a.name.localeCompare(b.name);
  });

  const header = [
    "id",
    "name",
    "slug",
    "url",
    "current_type",
    "current_essence",
    "current_duration",
    "current_gender",
    "current_religious_affiliation",
    "current_israeli_integration",
    "current_region",
    "proposed_type",
    "proposed_essence",
    "reviewer",
    "notes",
  ];

  const lines = rows.map((r) =>
    header.map((key) => csvField(String(r[key as keyof typeof r]))).join(",")
  );

  const outDir = path.join(__dirname, "..", "exports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "tag-audit.csv");
  fs.writeFileSync(outPath, [header.join(","), ...lines].join("\n") + "\n");

  const typeTags = await prisma.tag.findMany({
    where: { category: FAMILY.type },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { slug: true },
  });
  const essenceTags = await prisma.tag.findMany({
    where: { category: FAMILY.essence },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { slug: true },
  });

  console.log(`Wrote exports/tag-audit.csv (${rows.length} rows)`);
  console.log(`Valid type-family slugs (${FAMILY.type}): ${typeTags.map((t) => t.slug).join(", ")}`);
  console.log(`Valid essence-family slugs (${FAMILY.essence}): ${essenceTags.map((t) => t.slug).join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
