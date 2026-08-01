/**
 * One-time content edit, explicitly requested by the site owner (2026-08-01, following
 * poll/choice-question-layout): four end-anchor labels were too long to fit two lines at
 * 390px (SegmentedScale only ever displays labels[0]/labels[4] as anchors -- see
 * lib/pollShared.ts's resolveOptionKind and components/polls/SegmentedScale.tsx). Per
 * CLAUDE.md's standing rules this is a (b) field overwrite: snapshot prior values,
 * print row counts, proceed only after approval.
 *
 * Each edit only replaces the ONE array index that was too long -- the other four
 * entries in each question's `labels` (including its own other end) are read from the
 * live row and copied through unchanged, never overwritten with a hardcoded literal, so
 * a stale assumption about the current array can't silently clobber an untouched label.
 * `text`, `type`, `tier`, and every other column are left alone -- only `labels` is ever
 * in this script's `data` object.
 *
 *   set -a && source .env && set +a && npx tsx prisma/shorten-poll-anchor-labels.ts
 *   set -a && source .env && set +a && npx tsx prisma/shorten-poll-anchor-labels.ts --commit
 *
 * --dry-run (default) only snapshots and reports.
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const COMMIT = process.argv.includes("--commit");
const SNAPSHOT_PATH = "data/poll-anchor-labels-before-2026-08-01.json";

const EDITS: { key: string; index: number; expectedCurrent: string; next: string }[] = [
  {
    key: "social_nights",
    index: 0,
    expectedCurrent: "Almost always stayed in (studying, resting, low-key)",
    next: "Almost always stayed in",
  },
  {
    key: "social_nights",
    index: 4,
    expectedCurrent: "Almost always went out (nightlife, socializing off-campus)",
    next: "Almost always went out",
  },
  {
    key: "niche_social",
    index: 4,
    expectedCurrent: "There is a specific type and vibe of person that goes here",
    next: "A specific type and vibe of person",
  },
  {
    key: "army_mentorship",
    index: 4,
    expectedCurrent: "I feel completely accompanied and mentored ",
    next: "Fully accompanied and mentored",
  },
];

async function main() {
  const keys = [...new Set(EDITS.map((e) => e.key))];
  const before = await prisma.pollQuestion.findMany({
    where: { key: { in: keys } },
    select: { id: true, key: true, labels: true },
  });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(before, null, 2));
  console.log(`Snapshot of ${before.length} PollQuestion rows written to ${SNAPSHOT_PATH}`);

  const byKey = new Map(before.map((q) => [q.key, q]));
  const plannedUpdates: { key: string; id: string; labels: string[] }[] = [];

  for (const key of keys) {
    const row = byKey.get(key);
    if (!row) throw new Error(`Expected a PollQuestion with key="${key}", found none. Aborting.`);
    const labels = [...row.labels];
    for (const edit of EDITS.filter((e) => e.key === key)) {
      const current = labels[edit.index];
      if (current !== edit.expectedCurrent) {
        throw new Error(
          `"${key}" labels[${edit.index}] is "${current}", expected "${edit.expectedCurrent}" -- ` +
            `the live data has moved since this script was written. Aborting without writing.`
        );
      }
      labels[edit.index] = edit.next;
      console.log(`  ${key}[${edit.index}]: "${current}" (${current.trim().length} chars) -> "${edit.next}" (${edit.next.length} chars)`);
    }
    plannedUpdates.push({ key, id: row.id, labels });
  }

  if (!COMMIT) {
    console.log("\nDry run only -- no writes performed. Re-run with --commit to apply.");
    return;
  }

  for (const u of plannedUpdates) {
    await prisma.pollQuestion.update({ where: { id: u.id }, data: { labels: u.labels } });
    console.log(`Updated ${u.key}.`);
  }

  const after = await prisma.pollQuestion.findMany({
    where: { key: { in: keys } },
    select: { id: true, key: true, labels: true },
  });
  console.log(`\nRows touched: expected ${plannedUpdates.length} / actual ${after.length}`);
  for (const row of after) console.log(`  ${row.key}: ${JSON.stringify(row.labels)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
