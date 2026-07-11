/**
 * Repairs a bad tag merge: at some point after prisma/retag-taxonomy.ts ran (which
 * conservatively proposed "rz-modern-orthodox" for only 42 programs, deliberately
 * leaving the rest blank because a bare legacy "orthodox" tag is ambiguous between
 * Religious-Zionist/Modern-Orthodox and Haredi -- see that script's comments), someone
 * merged the legacy "orthodox" tag wholesale into "rz-modern-orthodox" (most likely via
 * the admin Tag manager's merge action, which reuses lib/tags.ts's mergeTags -- there is
 * no committed script for it). That single merge silently mislabeled every program that
 * used to carry bare "orthodox", including several whose own description explicitly
 * states a different affiliation (Litvish, Haredi, Sephardic).
 *
 * This script rebuilds the keep set from first principles instead of trying to detect
 * "did this specific program come from the bad merge": a program keeps
 * rz-modern-orthodox only if EITHER retag-taxonomy.ts's original conservative tag-based
 * signal proposed it (data/retag-preview.json) OR its live description explicitly states
 * a Religious-Zionist / Modern-Orthodox / Hesder / Bnei-Akiva affiliation. Everything
 * else loses the tag. Two of the strip candidates (Yeshivas Bais Yisroel, Yeshivat Toras
 * Moshe) have descriptions that explicitly say "Litvish Orthodox" and so additionally
 * gain haredi-ultra-orthodox-yeshivish. Stripped programs whose description states no
 * affiliation at all are written to a review queue for manual research, not silently
 * left alone.
 *
 * Two-phase, like the other prisma/*.ts scripts in this repo. Backup written BEFORE any
 * mutation, on every run:
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/revert-orthodox-affiliation.ts --dry-run
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/revert-orthodox-affiliation.ts --commit
 *
 * --dry-run is the default if neither flag is passed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const RZ_SLUG = "rz-modern-orthodox";
const HAREDI_SLUG = "harediultra-orthodoxyeshivish";

// Programs whose description explicitly names their real affiliation as Litvish --
// they lose rz-modern-orthodox (below) and additionally gain the Haredi/Litvish tag,
// rather than being left blank like the other contradicted programs.
const RECLASSIFY_TO_HAREDI = new Set(["yeshivas-bais-yisroel", "yeshivat-toras-moshe-tomo"]);

// Word-boundary signals that a description states a genuine RZ/Modern-Orthodox
// affiliation on its own terms, independent of any tag.
const RZ_SIGNAL = [
  /religious[\s-]?zionis[tm]/i,
  /modern[\s-]?orthodox/i,
  /\bhesder\b/i,
  /bnei\s+akiva/i,
];

// Word-boundary signals that a description states a different, contradicting
// affiliation -- used only for the dry-run report, not to decide keep/strip.
const CONTRADICTION_SIGNAL = [
  /\blitvish\b/i,
  /\byeshivish\b/i,
  /\bchassid/i,
  /\bhasid/i,
  /\bchabad\b/i,
  /\blubavitch\b/i,
  /\bsephard/i,
  /\bsepharad/i,
  /\bcharedi\b/i,
  /\bchareidi\b/i,
  /\bharedi\b/i,
  /\bhareidi\b/i,
  /\bbreslov\b/i,
  /\bcarlebach\b/i,
];

function matchesAny(patterns: RegExp[], text: string): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  const preview: { slug: string; proposed: { affiliation: string | null } }[] = JSON.parse(
    readFileSync("data/retag-preview.json", "utf-8")
  );
  const tagBasedKeep = new Set(
    preview.filter((r) => r.proposed?.affiliation === RZ_SLUG).map((r) => r.slug)
  );

  const [rzTag, haredéiTag] = await Promise.all([
    prisma.tag.findUniqueOrThrow({ where: { slug: RZ_SLUG } }),
    prisma.tag.findUniqueOrThrow({ where: { slug: HAREDI_SLUG } }),
  ]);

  const programs = await prisma.program.findMany({
    where: { tags: { some: { slug: RZ_SLUG } } },
    select: { id: true, slug: true, name: true, description: true, tags: { select: { slug: true } } },
    orderBy: { name: "asc" },
  });

  const backup = programs.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    tags: p.tags.map((t) => t.slug),
  }));
  const backupPath = `data/orthodox-affiliation-backup-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup of ${backup.length} programs written to ${backupPath}\n`);

  const keep: typeof programs = [];
  const strip: typeof programs = [];
  for (const p of programs) {
    const descSignal = matchesAny(RZ_SIGNAL, p.description);
    if (tagBasedKeep.has(p.slug) || descSignal) {
      keep.push(p);
    } else {
      strip.push(p);
    }
  }

  console.log(`=== KEEP (${keep.length}) -- rz-modern-orthodox stays ===`);
  for (const p of keep) {
    const reason = tagBasedKeep.has(p.slug) ? "tag-signal (retag-taxonomy)" : "description states RZ/MO";
    console.log(`  ${p.name} (${p.slug}) [${reason}]`);
  }

  const contradicted: typeof programs = [];
  const silent: typeof programs = [];
  for (const p of strip) {
    const hit = matchesAny(CONTRADICTION_SIGNAL, p.description) ?? matchesAny(CONTRADICTION_SIGNAL, p.name);
    if (hit) contradicted.push(p);
    else silent.push(p);
  }

  console.log(`\n=== STRIP: contradicted (${contradicted.length}) -- description names a different affiliation ===`);
  for (const p of contradicted) {
    const reclassify = RECLASSIFY_TO_HAREDI.has(p.slug) ? " -> +harediultra-orthodoxyeshivish" : "";
    console.log(`  ${p.name} (${p.slug})${reclassify}`);
  }

  console.log(`\n=== STRIP: silent (${silent.length}) -- description states no affiliation ===`);
  for (const p of silent) {
    console.log(`  ${p.name} (${p.slug})`);
  }

  const reviewQueue = silent.map((p) => ({ slug: p.slug, name: p.name, description: p.description }));
  const reviewPath = "data/affiliation-review-queue.json";
  writeFileSync(reviewPath, JSON.stringify(reviewQueue, null, 2));
  console.log(`\n${silent.length} silent programs written to ${reviewPath} for manual research.`);

  if (!commit) {
    console.log(
      `\nDry run only -- no changes written. ${keep.length} keep, ${strip.length} strip (${contradicted.length} contradicted, ${silent.length} silent). Re-run with --commit to apply.`
    );
    return;
  }

  console.log("\nApplying...");
  for (const p of strip) {
    await prisma.program.update({
      where: { id: p.id },
      data: {
        tags: {
          disconnect: { id: rzTag.id },
          ...(RECLASSIFY_TO_HAREDI.has(p.slug) ? { connect: { id: haredéiTag.id } } : {}),
        },
      },
    });
  }
  console.log(`Done. Stripped rz-modern-orthodox from ${strip.length} programs (${RECLASSIFY_TO_HAREDI.size} also reclassified to Haredi/Litvish).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
