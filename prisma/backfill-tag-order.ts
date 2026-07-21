/**
 * One-time backfill for Tag.order: most seeded tags share the default `order: 0`
 * (see prisma/reorder-taxonomy-tags.ts's header for the same root cause), which made
 * the admin reorder arrows' two-row swap a no-op whenever both rows tied at 0. The new
 * admin reorder-arrows flow (POST /api/admin/tags/reorder, lib/tags.ts's reorderTags)
 * normalizes a whole category group's orders on every move, but existing groups still
 * need an initial distinct ordering to move from.
 *
 * This assigns order = 0..n-1 within each category group (including uncategorized),
 * reading tags in the exact order they display today (orderBy: [{order:"asc"},
 * {name:"asc"}], same as lib/programs.ts's listAllTags) -- so nothing visibly moves,
 * ties just become distinct sequential values.
 *
 * Two-phase, like the other prisma/*.ts scripts in this repo. The backup file is
 * written BEFORE any mutation, on every run (dry or commit):
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/backfill-tag-order.ts --dry-run
 *   # review the printed plan + data/tag-order-backfill-<date>.json, then:
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/backfill-tag-order.ts --commit
 *
 * --dry-run is the default if neither flag is passed. Safe to re-run: reassigning
 * 0..n-1 to an already-sequential group is a no-op.
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

type TagBackupRow = { id: string; slug: string; category: string | null; before: number; after: number };

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  const tags = await prisma.tag.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });

  const byCategory = new Map<string, typeof tags>();
  for (const tag of tags) {
    const key = tag.category ?? "";
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(tag);
    else byCategory.set(key, [tag]);
  }

  const plan: TagBackupRow[] = [];
  for (const rows of byCategory.values()) {
    rows.forEach((tag, index) => {
      if (tag.order !== index) {
        plan.push({ id: tag.id, slug: tag.slug, category: tag.category, before: tag.order, after: index });
      }
    });
  }

  console.log(`\n=== Tag.order backfill (${commit ? "COMMIT" : "dry run"}) ===`);
  console.log(`${tags.length} tags across ${byCategory.size} category groups; ${plan.length} need a new order value.`);
  for (const p of plan) {
    console.log(`  [${p.category ?? "(uncategorized)"}] "${p.slug}": ${p.before} -> ${p.after}`);
  }

  const backupPath = `data/tag-order-backfill-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify(
      tags.map((t) => ({ id: t.id, slug: t.slug, category: t.category, order: t.order })),
      null,
      2
    )
  );
  console.log(`\nPre-change state (all ${tags.length} tags) written to ${backupPath}`);

  if (!commit) {
    console.log("\nDry run only -- no changes written. Re-run with --commit to apply.");
    return;
  }

  console.log("\nApplying...");
  await prisma.$transaction(
    plan.map((p) => prisma.tag.update({ where: { id: p.id }, data: { order: p.after } })),
    { timeout: 30_000 }
  );
  console.log(`Done. Updated order on ${plan.length} of ${tags.length} tags.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
