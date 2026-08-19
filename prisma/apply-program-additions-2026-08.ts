import { writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertNoImportedContactFields } from "@/lib/importGuards";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// One-off enrichment pass for the August 2026 research batch (see
// research/findings-2026-08.md). Follows the apply-structured-attrs-6.ts precedent:
// hardcoded slug -> field updates, applied via prisma.program.updateMany, with prior
// values snapshotted before every write and expected-vs-actual row counts printed
// after, per CLAUDE.md's standing DB-write rules. contactEmail/contactEmailSource are
// never included in any update object here (assertNoImportedContactFields guards
// every write) -- office emails found during research are recorded in adminNote
// instead, same as the import script diverts them to a review file.
const UPDATES: Record<string, Record<string, string>> = {
  "yeshivat-shavy-hebron": {
    contactWebsite: "https://shaveihevron.org/",
    contactPhone: "02-996-3777",
    adminNote:
      "General office email found during Aug 2026 research: office@shevron.org (not written -- contactEmail is owned exclusively by the contact-verification workflow). See research/findings-2026-08.md.",
  },
  "yeshivat-har-shalom-mitzpe-ashtamoa": {
    nameHe: "ישיבת הר שלום",
  },
  "mechinat-shuvu-achim": {
    contactPhone: "08-9170727",
  },
  "midreshet-lindenbaum": {
    durationText:
      '6 months (Midrashit, Aug–Nov), 11 months (Hadas Chu"l), or 18 months (Machal option)',
    adminNote:
      'Split from a single combined entry in Aug 2026 -- this row is specifically the Hadas Chu"l / overseas track (applytosem.org signup); see the separate "Midreshet Lindenbaum — Hadas" entry for the Israeli program. Coordinator: Ariel Hurwich Braun, ariel@ots.org.il, +972-54-5814783 (not written to contactEmail). See research/findings-2026-08.md.',
  },
};

async function main() {
  const slugs = Object.keys(UPDATES);

  const existing = await prisma.program.findMany({
    where: { slug: { in: slugs } },
    select: {
      slug: true,
      contactWebsite: true,
      contactPhone: true,
      nameHe: true,
      durationText: true,
      adminNote: true,
    },
  });
  const existingBySlug = new Map(existing.map((p) => [p.slug, p]));

  const snapshot = slugs.map((slug) => ({
    slug,
    priorValues: existingBySlug.has(slug)
      ? Object.fromEntries(
          Object.keys(UPDATES[slug]).map((field) => [
            field,
            (existingBySlug.get(slug) as Record<string, unknown>)[field] ?? null,
          ])
        )
      : null,
    proposedValues: UPDATES[slug],
    foundInDb: existingBySlug.has(slug),
  }));
  const today = new Date().toISOString().slice(0, 10);
  const snapshotPath = join(__dirname, "..", "data", `program-additions-2026-08-backup-${today}.json`);
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot of prior values written to ${snapshotPath} (${snapshot.length} rows)`);

  let updated = 0;
  let missing = 0;

  for (const slug of slugs) {
    if (!existingBySlug.has(slug)) {
      console.warn(`  [missing] "${slug}" has no matching Program row -- skipped.`);
      missing++;
      continue;
    }
    const data = UPDATES[slug];
    assertNoImportedContactFields(data);
    const res = await prisma.program.updateMany({ where: { slug }, data });
    console.log(`${slug}: ${Object.keys(data).join(", ")} -> ${res.count} row(s)`);
    updated += res.count;
  }

  console.log(`\nExpected: ${slugs.length} slugs`);
  console.log(`Updated: ${updated} row(s)`);
  console.log(`Missing (no matching slug): ${missing}`);

  if (updated !== slugs.length - missing) {
    throw new Error(
      `Mismatch: expected ${slugs.length - missing} updates but ${updated} rows were actually updated.`
    );
  }
  console.log("OK: updated count matches expected.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
