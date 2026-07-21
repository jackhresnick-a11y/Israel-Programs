// One-off backfill: flips ProgramPollConfig.pollLinkPublic on for every published
// program, so the /rate picker page can link straight to each program's anonymous
// poll form instead of a sign-in wall. Reuses lib/pollConfig.ts's
// upsertProgramPollConfig, which mints a ReferrerToken only when the config has no
// publicTokenId yet -- safe to re-run, idempotent.
import { prisma } from "@/lib/prisma";
import { listPublishedProgramNames } from "@/lib/programs";
import { upsertProgramPollConfig } from "@/lib/pollConfig";
import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const programs = await listPublishedProgramNames();
  const expected = programs.length;

  const before = await prisma.programPollConfig.findMany({
    where: { programId: { in: programs.map((p) => p.id) } },
    select: { programId: true, pollLinkPublic: true, publicTokenId: true },
  });
  const beforeByProgramId = new Map(before.map((c) => [c.programId, c]));
  const snapshot = programs.map((p) => ({
    id: p.id,
    slug: p.slug,
    pollLinkPublic: beforeByProgramId.get(p.id)?.pollLinkPublic ?? false,
    publicTokenId: beforeByProgramId.get(p.id)?.publicTokenId ?? null,
  }));
  const snapshotPath = join(
    __dirname,
    "..",
    "data",
    `public-poll-links-backup-${new Date().toISOString().slice(0, 10)}.json`
  );
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot written to ${snapshotPath} (${snapshot.length} rows)`);

  console.log(`Expected: ${expected} published programs`);

  for (const program of programs) {
    await upsertProgramPollConfig(program.id, { pollLinkPublic: true });
  }

  const actual = await prisma.programPollConfig.count({
    where: {
      programId: { in: programs.map((p) => p.id) },
      pollLinkPublic: true,
      publicTokenId: { not: null },
    },
  });
  console.log(`Actual: ${actual} programs with pollLinkPublic=true and a minted token`);

  if (actual !== expected) {
    throw new Error(`Mismatch: expected ${expected}, got ${actual}`);
  }
  console.log("OK: expected matches actual.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
