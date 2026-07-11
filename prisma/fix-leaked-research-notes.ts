/**
 * One-time repair for research-process meta-commentary that leaked into public
 * Program.description text (see the data-quality remediation plan). Two classes of fix,
 * both applied by exact substring match against the live description so a change that
 * doesn't apply cleanly fails loudly instead of silently no-opping:
 *
 *   1. Verification caveats ("no dedicated website was found... verify...",
 *      "certificate mismatch... verify...") are moved out of the public description and
 *      into the new moderator-only Program.adminNote field (never selected into any
 *      public page or client-component props -- see app/programs/[slug]/edit/page.tsx).
 *   2. Bare database self-references ("...already in this database") and a stray
 *      "IMPORTANT NOTE:" / "as of a recent year" / research-verify sentence on AMHSI are
 *      rewritten into plain prose with no meta-commentary, nothing moved to adminNote
 *      unless it's actionable verification guidance.
 *
 * Two-phase, like the other prisma/*.ts scripts in this repo. Backup is written BEFORE
 * any mutation, on every run (dry or commit):
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/fix-leaked-research-notes.ts --dry-run
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/fix-leaked-research-notes.ts --commit
 *
 * --dry-run is the default if neither flag is passed.
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

type Fix = {
  slug: string;
  name: string;
  find: string;
  replace: string;
  adminNote?: string;
};

const FIXES: Fix[] = [
  {
    slug: "chemdas-bais-yaakov",
    name: "Chemdas Bais Yaakov",
    find: "A Jerusalem seminary and participating school in Touro's Israel Option; no dedicated website was found during research, so verify current status before relying on this entry.",
    replace: "A Jerusalem seminary and participating school in Touro's Israel Option.",
    adminNote:
      "No dedicated website was found during research -- verify current status before relying on this entry.",
  },
  {
    slug: "jewel-for-women",
    name: "JEWEL for Women",
    find: "Current website shows a certificate mismatch as of this research, so verify the program is still actively running before relying on this entry.",
    replace:
      "A short, inexpensive introduction to Judaism in Jerusalem for ages 19-31, with airfare, room, board, classes, and field trips included; taught in English with no Hebrew required.",
    adminNote:
      "Current website shows a certificate mismatch -- verify the program is still actively running before relying on this entry.",
  },
  {
    slug: "bnei-akiva-olamit-shalem",
    name: "Bnei Akiva Olamit: Shalem",
    find: "A sixth distinct World Bnei Akiva program track alongside Kadima, Torani, MTA, Limmud, and Mechina Olamit, all already in this database.",
    replace:
      "A sixth distinct World Bnei Akiva program track alongside Kadima, Torani, MTA, Limmud, and Mechina Olamit.",
  },
  {
    slug: "mayanot-womens-program",
    name: "Mayanot Women's Program",
    find: "the women's counterpart to Mayanot's men's post-high-school program already in this database.",
    replace: "the women's counterpart to Mayanot's men's post-high-school program.",
  },
  {
    slug: "neve-yerushalayim-mechina-introductory-program",
    name: "Neve Yerushalayim – Mechina Introductory Program",
    find: "a shorter taste of Neve's curriculum distinct from the school's two longer programs already in this database.",
    replace: "a shorter taste of Neve's curriculum distinct from the school's two longer programs.",
  },
  {
    slug: "alexander-muss-high-school-in-israel-amhsi",
    name: "Alexander Muss High School in Israel (AMHSI)",
    find: "IMPORTANT NOTE: the Reform movement's own standalone semester program, URJ Heller High (formerly NFTY-EIE, previously based at Kibbutz Tzuba), recently merged into AMHSI as of a recent year due to declining enrollment -- Heller High students now live and take Jewish studies together as a track within the AMHSI campus near Tel Aviv rather than as a separate program. Confirm current Heller-track availability/dates directly with AMHSI since this transition is recent.",
    replace:
      "The Reform movement's own standalone semester program, URJ Heller High (formerly NFTY-EIE, previously based at Kibbutz Tzuba), recently merged into AMHSI due to declining enrollment -- Heller High students now live and take Jewish studies together as a track within the AMHSI campus near Tel Aviv rather than as a separate program.",
    adminNote: "Confirm current Heller-track availability/dates directly with AMHSI since this transition is recent.",
  },
];

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  const programs = await prisma.program.findMany({
    where: { slug: { in: FIXES.map((f) => f.slug) } },
    select: { id: true, slug: true, name: true, description: true, adminNote: true },
  });
  const bySlug = new Map(programs.map((p) => [p.slug, p]));

  const backup = programs.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    adminNote: p.adminNote,
  }));
  const backupPath = `data/leaked-research-notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup of ${backup.length} programs written to ${backupPath}`);

  let applied = 0;
  for (const fix of FIXES) {
    const program = bySlug.get(fix.slug);
    if (!program) {
      throw new Error(`Program not found for slug "${fix.slug}" (${fix.name})`);
    }
    if (!program.description.includes(fix.find)) {
      throw new Error(
        `Description for "${fix.name}" (${fix.slug}) no longer contains the expected text -- re-check before proceeding.\nExpected substring: ${fix.find}`
      );
    }
    const newDescription = program.description.replace(fix.find, fix.replace);
    console.log(`\n--- ${fix.name} (${fix.slug})`);
    console.log(`  description: ...${fix.find.slice(0, 60)}...`);
    console.log(`            -> ...${fix.replace.slice(0, 60)}...`);
    if (fix.adminNote) {
      console.log(`  adminNote  -> "${fix.adminNote}"`);
    }
    if (commit) {
      await prisma.program.update({
        where: { id: program.id },
        data: {
          description: newDescription,
          ...(fix.adminNote ? { adminNote: fix.adminNote } : {}),
        },
      });
      applied++;
    }
  }

  if (!commit) {
    console.log(`\nDry run only -- no changes written. ${FIXES.length} fixes validated. Re-run with --commit to apply.`);
  } else {
    console.log(`\nDone. Updated ${applied} programs.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
