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
 * A program with no current tags in a category pre-fills as the literal sentinel
 * "NONE", not an empty string -- current_type/current_essence stay real empty strings
 * (the read-only reference), but if proposed_* also started blank for an untagged
 * program, "empty because it had nothing" and "empty because a reviewer cleared it"
 * would be indistinguishable in the CSV. NONE reads as "confirmed no tags" until a
 * reviewer either leaves it (import-tag-audit.ts treats NONE the same as blank -- no
 * change against an already-empty category) or replaces/deletes it.
 *
 * Row-building itself lives in lib/tagAudit.ts, shared with the admin CSV-download route
 * (app/api/admin/tags/audit-csv/route.ts) so the two can never diverge on CSV shape.
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
import { FAMILY, buildAuditRow, compareAuditRows, renderAuditCsv } from "../lib/tagAudit";

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

  const rows = programs
    .map((p) => buildAuditRow(p, durationLabels, regions))
    .sort(compareAuditRows);

  const outDir = path.join(__dirname, "..", "exports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "tag-audit.csv");
  fs.writeFileSync(outPath, renderAuditCsv(rows));

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
