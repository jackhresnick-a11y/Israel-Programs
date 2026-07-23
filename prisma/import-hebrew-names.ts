// One-off import: writes the CONFIRMED subset of research/hebrew-names.json into
// Program.nameHe. UNCERTAIN and NOT_FOUND rows are skipped entirely -- this is
// deliberately a narrower, higher-confidence subset than the full research file (see
// research/hebrew-names-review.md for the UNCERTAIN rows still awaiting human review).
// Snapshots prior nameHe values (all null, since this is the first import) before
// writing, and prints expected vs. actual row counts per the standing rule.
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";

type HebrewNameRecord = {
  id: string;
  name: string;
  nameHe: string | null;
  sourceUrl: string | null;
  confidence: "CONFIRMED" | "UNCERTAIN" | "NOT_FOUND";
};

async function main() {
  const jsonPath = join(__dirname, "..", "research", "hebrew-names.json");
  const records = JSON.parse(readFileSync(jsonPath, "utf-8")) as HebrewNameRecord[];
  const confirmed = records.filter((r) => r.confidence === "CONFIRMED");

  console.log(`Total records in file: ${records.length}`);
  console.log(`CONFIRMED (to import): ${confirmed.length}`);
  console.log(`Skipping ${records.length - confirmed.length} UNCERTAIN/NOT_FOUND rows entirely.`);

  const existing = await prisma.program.findMany({
    where: { id: { in: confirmed.map((r) => r.id) } },
    select: { id: true, name: true, nameHe: true, status: true },
  });
  const existingById = new Map(existing.map((p) => [p.id, p]));

  const snapshot = confirmed.map((r) => ({
    id: r.id,
    name: r.name,
    priorNameHe: existingById.get(r.id)?.nameHe ?? null,
    proposedNameHe: r.nameHe,
    foundInDb: existingById.has(r.id),
  }));
  const today = new Date().toISOString().slice(0, 10);
  const snapshotPath = join(__dirname, "..", "data", `nameHe-import-backup-${today}.json`);
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot written to ${snapshotPath} (${snapshot.length} rows)`);

  const succeeded: { id: string; name: string; nameHe: string }[] = [];
  const failed: { id: string; name: string; reason: string }[] = [];

  for (const r of confirmed) {
    const program = existingById.get(r.id);
    if (!program) {
      failed.push({ id: r.id, name: r.name, reason: "No Program row with this id (deleted/renamed since research?)" });
      continue;
    }
    if (program.status !== "PUBLISHED") {
      failed.push({ id: r.id, name: r.name, reason: `Program status is ${program.status}, not PUBLISHED` });
      continue;
    }
    if (!r.nameHe) {
      failed.push({ id: r.id, name: r.name, reason: "CONFIRMED row has empty/null nameHe -- data integrity issue" });
      continue;
    }
    try {
      await prisma.program.update({ where: { id: r.id }, data: { nameHe: r.nameHe } });
      succeeded.push({ id: r.id, name: r.name, nameHe: r.nameHe });
    } catch (err) {
      failed.push({ id: r.id, name: r.name, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log(`\nExpected: ${confirmed.length} CONFIRMED rows`);
  console.log(`Succeeded: ${succeeded.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) {
      console.log(`  - ${f.id} (${f.name}): ${f.reason}`);
    }
  }

  const actual = await prisma.program.count({
    where: { id: { in: confirmed.map((r) => r.id) }, nameHe: { not: null } },
  });
  console.log(`\nVerification: ${actual} of ${confirmed.length} CONFIRMED-set programs now have a non-null nameHe.`);

  if (actual !== succeeded.length) {
    throw new Error(`Mismatch: reported ${succeeded.length} succeeded but DB shows ${actual} non-null.`);
  }
  console.log("OK: succeeded count matches DB state.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
