/**
 * One-time migration for the after-submit email-verification removal: converts every
 * PollResponse stuck at `status = PENDING` (all anonymous -- the state only the removed
 * magic-link flow could leave a response in) to COUNTED or FLAGGED, per the same
 * anti-abuse rules lib/pollResponses.ts's submitAnonymousResponse now applies at submit
 * time. These are real completions that only failed to count because the follow-up
 * email click never happened -- nothing here fabricates a submission.
 *
 * Rules applied, in createdAt order (oldest first, so an earlier real completion wins
 * the "one counted per ipHash per program" slot over a later one from the same ip):
 *   - Start from the response's own already-stored `flags` (token over-cap/revoked/
 *     expired and any repeat_ip already detected were computed correctly at original
 *     submission time -- trusted as-is, not recomputed).
 *   - Freshly recompute repeat_ip dedup only, since that depends on what else is being
 *     migrated together: a response is flagged repeat_ip if its (program, ipHash) pair
 *     already has a COUNTED response, either pre-existing or newly counted earlier in
 *     this same migration run.
 *   - Any flags at all -> FLAGGED. None -> COUNTED.
 * Deliberately NOT applied: repeat_browser (the browser-cookie signal didn't exist at
 * original submission time, so there is no way to retroactively know if the same
 * browser submitted twice -- this migration can only judge on ipHash/token signals).
 *
 * Two-phase, like the other prisma/*.ts scripts in this repo. The backup file is
 * written BEFORE any mutation, on every run (dry or commit):
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/migrate-pending-responses.ts --dry-run
 *   # review the printed plan + data/pending-responses-backup-<date>.json, then:
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/migrate-pending-responses.ts --commit
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { POLL_FLAGS } from "../lib/pollShared";

async function main() {
  const commit = process.argv.includes("--commit");

  const pending = await prisma.pollResponse.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { program: { select: { name: true, slug: true } } },
  });

  if (pending.length === 0) {
    console.log("No PENDING responses found -- nothing to migrate.");
    return;
  }

  const backupPath = `data/pending-responses-backup-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(backupPath, JSON.stringify(pending, null, 2));
  console.log(`Pre-change state (${pending.length} PENDING responses) written to ${backupPath}`);

  const existingCounted = await prisma.pollResponse.findMany({
    where: { status: "COUNTED" },
    select: { programId: true, ipHash: true },
  });
  const countedIpKeys = new Set(existingCounted.map((r) => `${r.programId}::${r.ipHash}`));

  const plan: { id: string; program: string; nextStatus: "COUNTED" | "FLAGGED"; flags: string[] }[] = [];

  for (const r of pending) {
    const ipKey = `${r.programId}::${r.ipHash}`;
    const flags = [...r.flags];
    if (countedIpKeys.has(ipKey) && !flags.includes(POLL_FLAGS.REPEAT_IP)) {
      flags.push(POLL_FLAGS.REPEAT_IP);
    }
    const nextStatus = flags.length > 0 ? "FLAGGED" : "COUNTED";
    if (nextStatus === "COUNTED") countedIpKeys.add(ipKey);
    plan.push({ id: r.id, program: r.program.name, nextStatus, flags });
  }

  const countedCount = plan.filter((p) => p.nextStatus === "COUNTED").length;
  const flaggedCount = plan.filter((p) => p.nextStatus === "FLAGGED").length;

  console.log(`\nPlan: ${countedCount} -> COUNTED, ${flaggedCount} -> FLAGGED (of ${pending.length} PENDING).`);
  console.log("\nDetail:");
  for (const p of plan) {
    console.log(`  ${p.id}  ${p.program}  ->  ${p.nextStatus}${p.flags.length ? "  [" + p.flags.join(", ") + "]" : ""}`);
  }

  if (!commit) {
    console.log("\nDry run only -- no changes written. Re-run with --commit to apply.");
    return;
  }

  console.log("\nApplying...");
  for (const p of plan) {
    await prisma.pollResponse.update({
      where: { id: p.id },
      data: { status: p.nextStatus, flags: p.flags, verified: false },
    });
  }
  console.log(`Done. ${countedCount} responses now COUNTED, ${flaggedCount} now FLAGGED.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
