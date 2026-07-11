/**
 * Approved one-time purge (see conversation log 2026-07-10): Program.contactEmail has no
 * committed write path that also sets contactEmailSource -- prisma/seed.ts and
 * prisma/import-researched.ts both write contactEmail directly with zero provenance, and
 * grepping the whole repo shows contactEmailSource is never written by any code here (only
 * read, by lib/emailVerification.ts and app/admin/email-verification/page.tsx). Of 209
 * programs with a non-null contactEmail, 130 have no contactEmailSource at all -- this
 * nulls contactEmail on exactly those 130 rows, leaving the 79 rows that do carry a
 * contactEmailSource untouched (byte-identical).
 *
 * Snapshot (slug, contactEmail, updatedAt) written before the write, every run. Aborts
 * without writing if the affected-row count isn't exactly 130, and errors loudly if the
 * post-write survivor count isn't exactly 79.
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/purge-unsourced-contact-emails.ts
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

async function main() {
  const affected = await prisma.program.findMany({
    where: { contactEmailSource: null, contactEmail: { not: null } },
    select: { slug: true, contactEmail: true, updatedAt: true },
    orderBy: { slug: "asc" },
  });

  const backupPath = "data/unsourced-email-purge-2026-07-10.json";
  writeFileSync(backupPath, JSON.stringify(affected, null, 2));
  console.log(`Snapshot of ${affected.length} affected rows written to ${backupPath}`);
  console.log(`ROW COUNT: ${affected.length}`);
  if (affected.length !== 130) {
    throw new Error(
      `Expected exactly 130 affected rows, found ${affected.length} -- aborting, no write performed.`
    );
  }

  const result = await prisma.program.updateMany({
    where: { contactEmailSource: null, contactEmail: { not: null } },
    data: { contactEmail: null },
  });
  console.log(`\nApplied: contactEmail set to NULL on ${result.count} rows.`);

  const survivorCount = await prisma.program.count({ where: { contactEmail: { not: null } } });
  console.log(`\nPost-write non-null contactEmail count: ${survivorCount}`);
  if (survivorCount !== 79) {
    throw new Error(`Expected exactly 79 survivor rows, found ${survivorCount} -- investigate immediately.`);
  }

  const samples = await prisma.program.findMany({
    where: { contactEmail: { not: null } },
    select: { name: true, slug: true, contactEmail: true, contactEmailSource: true },
    take: 5,
    orderBy: { name: "asc" },
  });
  console.log("\n5 sample survivor rows:");
  for (const s of samples) console.log(JSON.stringify(s));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
