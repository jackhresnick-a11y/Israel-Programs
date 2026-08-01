/**
 * One-time classification write for the poll choice-question layout change
 * (poll/choice-question-layout). PollQuestion.optionKind is nullable and defaults to
 * "derive -> ORDINAL" for every existing question (see the column's schema.prisma doc
 * comment and lib/pollShared.ts's resolveOptionKind) -- exactly one question in the
 * live question bank is genuinely categorical rather than ordinal:
 *
 *   unit_assignments -- "what type of units did the top third of your cohort go to?"
 *   Jobnik/intelligence, Combat support, Gdudim/Basic infantry, Sayeret/Commando, Elite
 *   units are different KINDS of unit, not different AMOUNTS of one thing -- the 1-5
 *   label order encodes an editorial "eliteness" axis, not a spectrum a respondent's
 *   answer moves linearly along the way free_time or social_nights does.
 *
 * Per CLAUDE.md's standing rules this is classified as (b) a field overwrite: snapshot
 * the prior column state, print expected vs. actual row counts, proceed only after
 * approval. Deliberately NOT folded into the migration SQL -- declaring a question
 * categorical is a judgment call, not a schema change, and must be separately visible.
 *
 * No `labels` or `text` field is read from or written to in this script's `data` object
 * -- only `optionKind` is ever touched.
 *
 *   set -a && source .env && set +a && npx tsx prisma/set-unit-assignments-option-kind.ts
 *   set -a && source .env && set +a && npx tsx prisma/set-unit-assignments-option-kind.ts --commit
 *
 * --dry-run (the default if neither flag is passed) only snapshots and reports; nothing
 * is written to the DB unless --commit is passed.
 *
 * Undo, if ever needed:
 *   UPDATE "PollQuestion" SET "optionKind" = NULL WHERE "key" = 'unit_assignments';
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const COMMIT = process.argv.includes("--commit");
const TARGET_KEY = "unit_assignments";
const SNAPSHOT_PATH = "data/poll-optionkind-before-2026-08-01.json";

async function main() {
  const before = await prisma.pollQuestion.findMany({
    select: { id: true, key: true, text: true, type: true, scaleType: true, tier: true, optionKind: true },
    orderBy: { key: "asc" },
  });

  writeFileSync(SNAPSHOT_PATH, JSON.stringify(before, null, 2));
  console.log(`Snapshot of ${before.length} PollQuestion rows written to ${SNAPSHOT_PATH}`);

  const nonNullCount = before.filter((q) => q.optionKind !== null).length;
  console.log(`optionKind currently non-null on ${nonNullCount} of ${before.length} rows (expected: 0)`);
  if (nonNullCount !== 0) {
    throw new Error(
      `Expected every row's optionKind to be NULL before this script runs (it has never been set before) -- found ${nonNullCount} non-null. Aborting without writing.`
    );
  }

  const target = before.filter((q) => q.key === TARGET_KEY);
  if (target.length !== 1) {
    throw new Error(`Expected exactly 1 row with key="${TARGET_KEY}", found ${target.length}. Aborting without writing.`);
  }
  console.log(`\nTarget row: ${JSON.stringify(target[0], null, 2)}`);

  if (!COMMIT) {
    console.log("\nDry run only -- no writes performed. Re-run with --commit to apply.");
    return;
  }

  const result = await prisma.pollQuestion.update({
    where: { key: TARGET_KEY },
    data: { optionKind: "CATEGORICAL" },
  });
  console.log(`\nUpdated 1 row (expected 1 / actual 1).`);
  console.log(`Post-write row: ${JSON.stringify(result, null, 2)}`);

  const totalAfter = await prisma.pollQuestion.count();
  const nonNullAfter = await prisma.pollQuestion.count({ where: { optionKind: { not: null } } });
  console.log(`\nPollQuestion total: before=${before.length} after=${totalAfter} (expected identical)`);
  console.log(`optionKind non-null: before=${nonNullCount} after=${nonNullAfter} (expected before+1)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
