/**
 * One-off fix for /match's gender hard-eliminator leak: "Girls only"/"Boys only" are
 * FlowOption rows with matchMode: REQUIRE, but requireIncludesUntagged defaulted to
 * true on both, so a program carrying NO gender tag survived either filter -- some of
 * the ~27 untagged live programs read as single-gender in practice (e.g. "The
 * Jerusalem Kollel", "Ohrsom"), so a girls-only pick could surface a boys-oriented
 * program. Nothing wrong with the eliminator mechanism itself -- both options were
 * already REQUIRE, not WEIGHT -- this only flips the untagged-admits flag.
 *
 * Data-driven, not hardcoded: selects every ACTIVE FlowOption whose matchMode is
 * REQUIRE and whose tagSlugs resolve to a Tag with category "gender" -- never the
 * option key or the question key, which is admin-renameable and has already drifted
 * from the "program-gender"/"boys-only" keys the original seed
 * (prisma/seed-match-v2-questions.ts) used to the live
 * "what-kind-of-program-are-you-looking-for" key. "Mixed" is WEIGHT, not REQUIRE, so
 * it is never selected here and is untouched by design -- see the task notes for why
 * (the spec's "Mixed leaves single-gender paths open" is a deliberate choice, not part
 * of this bug).
 *
 * DRY-RUN BY DEFAULT. Snapshots prior values to
 * data/strict-gender-eliminator-backup-<date>.json before writing. Idempotent -- a
 * second run reports 0 rows changed.
 *
 * ⚠️ The Neon DB is shared by local dev and production (see CLAUDE.md) -- --commit
 * changes production immediately, independent of any PR/deploy.
 *
 * Usage (loads DATABASE_URL from .env / .env.local first):
 *   set -a && source .env && source .env.local && set +a
 *   npx tsx prisma/strict-gender-eliminator.ts             # dry run
 *   npx tsx prisma/strict-gender-eliminator.ts --commit     # write
 */
import { writeFileSync } from "fs";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const COMMIT = process.argv.includes("--commit");
const BACKUP_PATH = `data/strict-gender-eliminator-backup-${new Date().toISOString().slice(0, 10)}.json`;

async function main() {
  const genderTags = await prisma.tag.findMany({
    where: { category: "gender" },
    select: { id: true, slug: true },
  });
  const genderTagSlugs = new Set(genderTags.map((t) => t.slug));
  if (genderTagSlugs.size === 0) {
    throw new Error("No Tag rows with category 'gender' found -- aborting, nothing to target.");
  }

  const requireOptions = await prisma.flowOption.findMany({
    where: { matchMode: "REQUIRE", status: "ACTIVE" },
    select: {
      id: true,
      key: true,
      label: true,
      tagSlugs: true,
      requireIncludesUntagged: true,
      questionId: true,
      question: { select: { key: true, prompt: true } },
    },
  });

  const targets = requireOptions.filter((o) => o.tagSlugs.some((slug) => genderTagSlugs.has(slug)));

  console.log(COMMIT ? "=== MODE: COMMIT (writes to the shared DB) ===\n" : "=== MODE: dry run (no changes) ===\n");
  console.log(`Found ${requireOptions.length} ACTIVE REQUIRE FlowOption row(s) total.`);
  console.log(`${targets.length} of them target a gender-category tag:\n`);
  for (const t of targets) {
    console.log(
      `  [${t.question.key}] "${t.label}" (key=${t.key}) tagSlugs=${JSON.stringify(t.tagSlugs)} requireIncludesUntagged=${t.requireIncludesUntagged}`
    );
  }

  if (targets.length !== 2) {
    console.warn(
      `\n⚠️  Expected exactly 2 gender REQUIRE options (Boys only, Girls only), found ${targets.length}. Review before proceeding.`
    );
  }

  const alreadyStrict = targets.filter((t) => t.requireIncludesUntagged === false);
  const needsFix = targets.filter((t) => t.requireIncludesUntagged !== false);
  console.log(`\n${alreadyStrict.length} already strict, ${needsFix.length} need the flag flipped.`);

  if (needsFix.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  const snapshot = needsFix.map((t) => ({
    id: t.id,
    questionKey: t.question.key,
    label: t.label,
    key: t.key,
    tagSlugs: t.tagSlugs,
    requireIncludesUntagged: t.requireIncludesUntagged,
  }));

  if (!COMMIT) {
    console.log(`\nDry run only -- would snapshot ${snapshot.length} row(s) to ${BACKUP_PATH} and set requireIncludesUntagged=false.`);
    console.log("Re-run with --commit to write.");
    return;
  }

  writeFileSync(BACKUP_PATH, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote prior-values snapshot to ${BACKUP_PATH}`);

  let updated = 0;
  for (const t of needsFix) {
    await prisma.flowOption.update({
      where: { id: t.id },
      data: { requireIncludesUntagged: false },
    });
    console.log(`  [fixed] [${t.question.key}] "${t.label}": requireIncludesUntagged true -> false`);
    updated++;
  }

  console.log(`\nExpected ${needsFix.length} rows touched, actually updated ${updated}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
