/**
 * Applies the human-reviewed affiliation tags from the 2026-07-11 interactive review of
 * data/affiliation-proposals-2026-07-11.json. Every row here was explicitly approved by
 * the site owner in a batch walkthrough; the 53 machine-generated proposals were NOT
 * applied wholesale (5 were skipped as word-sense false positives, and 2 -- Har Bracha,
 * Netzer Matai -- were reassigned off a wrong "secular"/"flexible" signal to
 * rz-modern-orthodox). This is the deliberate, opposite-of-wholesale counterpart to the
 * prior bad orthodox->rz merge that prisma/revert-orthodox-affiliation.ts had to undo.
 *
 * Additive relation edit only (CLAUDE.md class (a)): connects one existing affiliation
 * tag onto programs that currently have NO affiliation tag. Connects by existing tag id
 * resolved from slug -- never upsert/slugify (avoids the known duplicate-tag bug). No
 * removals, no new tag values.
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/apply-affiliation-approved.ts --dry-run
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/apply-affiliation-approved.ts --commit
 *
 * --dry-run is the default if neither flag is passed.
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const COMMIT = process.argv.includes("--commit");

// slug -> approved affiliation tag slug. Order/grouping mirrors the review batches.
const APPROVED: Record<string, string> = {
  // Batch 1 (skipped 1,4,5,7,8 as false positives)
  "beit-midrash-reuta-carmel": "rz-modern-orthodox",
  "bnei-david-eli": "rz-modern-orthodox",
  "hesder-yeshiva-akko": "rz-modern-orthodox",
  "mechinat-bina": "non-affiliated-religously",
  "mechinat-hanegev-sde-boker": "non-affiliated-religously",
  // Batch 2
  "mechinat-meitarim-lachish": "mixed-religously",
  "mechinat-minsharim-kalo": "non-affiliated-religously",
  "mechinat-ruach-nachon": "mixed-religously",
  "midreshet-hashiluv-natur": "mixed-religously",
  "midreshet-lev": "rz-modern-orthodox",
  "shiloh-excavations": "non-affiliated-religously",
  "tel-shimron-excavations": "non-affiliated-religously",
  "the-jerusalem-preparatory-program-hayerushalmit": "flexible-religously",
  "yeshivat-ahavat-israel-netivot": "rz-modern-orthodox",
  "yeshivat-ashkelon-orot-hatorah-vehachesed": "rz-modern-orthodox",
  // Batch 3
  "yeshivat-ayelet-hashachar-eilat": "rz-modern-orthodox",
  "yeshivat-birkat-yosef-alon-moreh": "rz-modern-orthodox",
  "yeshivat-chiburim-afula": "rz-modern-orthodox",
  "yeshivat-chiburim-beit-shean": "rz-modern-orthodox",
  "yeshivat-cholon": "rz-modern-orthodox",
  "yeshivat-derech-chaim-kiryat-gat": "rz-modern-orthodox",
  "yeshivat-givat-olga-hadera": "rz-modern-orthodox",
  "yeshivat-habikah-sdemot-neriah": "rz-modern-orthodox",
  "yeshivat-hagolan": "rz-modern-orthodox",
  "yeshivat-hahesder-dimona": "rz-modern-orthodox",
  // Batch 4 (35 Har Bracha reassigned non-affiliated -> rz)
  "yeshivat-hahesder-ramat-hasharon": "rz-modern-orthodox",
  "yeshivat-hahesder-ramla": "rz-modern-orthodox",
  "yeshivat-hahesder-rishon-lezion": "rz-modern-orthodox",
  "yeshivat-hameiri-kiryat-moshe": "rz-modern-orthodox",
  "yeshivat-har-bracha": "rz-modern-orthodox",
  "yeshivat-haseder-gavoha-kiryat-gat": "rz-modern-orthodox",
  "yeshivat-haseder-nof-hagalil": "rz-modern-orthodox",
  "yeshivat-hesder-maalot-yaakov": "rz-modern-orthodox",
  "yeshivat-hesder-orot-yaakov-rehovot": "rz-modern-orthodox",
  "yeshivat-karnei-shomron": "rz-modern-orthodox",
  // Batch 5 (44 Netzer Matai reassigned flexible -> rz)
  "yeshivat-kiryat-shmona": "rz-modern-orthodox",
  "yeshivat-midbara-keeden-mitzpe-ramon": "rz-modern-orthodox",
  "yeshivat-nachalat-yosef-shavei-shomron": "rz-modern-orthodox",
  "yeshivat-netzer-matai-ariel": "rz-modern-orthodox",
  "yeshivat-or-akiva": "rz-modern-orthodox",
  "yeshivat-or-veyeshua-haifa": "rz-modern-orthodox",
  "yeshivat-orot-moshe-rosh-haayin": "rz-modern-orthodox",
  "yeshivat-orot-shaul-tel-aviv": "rz-modern-orthodox",
  "yeshivat-ramat-gan": "rz-modern-orthodox",
  "yeshivat-sderot": "rz-modern-orthodox",
  "yeshivat-sdot-negev-kfar-maimon": "rz-modern-orthodox",
  "yeshivat-tfachot": "rz-modern-orthodox",
  "yeshivat-torah-vavodah-ytva": "rz-modern-orthodox",
};

async function main() {
  const entries = Object.entries(APPROVED);
  console.log(`Approved affiliation writes: ${entries.length}`);

  const tagSlugs = [...new Set(Object.values(APPROVED))];
  const tags = await prisma.tag.findMany({
    where: { slug: { in: tagSlugs }, category: "affiliation" },
    select: { id: true, slug: true },
  });
  const tagIdBySlug = new Map(tags.map((t) => [t.slug, t.id]));
  for (const slug of tagSlugs) {
    if (!tagIdBySlug.has(slug)) throw new Error(`Affiliation tag "${slug}" not found -- aborting.`);
  }

  // Resolve program ids + guard: every target must currently have NO affiliation tag,
  // exactly as the proposals were generated. If one already has one, something changed
  // since the review -- stop rather than silently double-tag or overwrite intent.
  const programs = await prisma.program.findMany({
    where: { slug: { in: entries.map(([s]) => s) } },
    select: { id: true, slug: true, tags: { where: { category: "affiliation" }, select: { slug: true } } },
  });
  const bySlug = new Map(programs.map((p) => [p.slug, p]));

  const snapshot: { programSlug: string; programId: string; addTagSlug: string }[] = [];
  const perTag: Record<string, number> = {};
  for (const [slug, tagSlug] of entries) {
    const p = bySlug.get(slug);
    if (!p) throw new Error(`Program "${slug}" not found -- aborting.`);
    if (p.tags.length > 0) {
      throw new Error(`Program "${slug}" already has affiliation tag(s) ${p.tags.map((t) => t.slug).join(",")} -- aborting (state changed since review).`);
    }
    snapshot.push({ programSlug: slug, programId: p.id, addTagSlug: tagSlug });
    perTag[tagSlug] = (perTag[tagSlug] ?? 0) + 1;
  }

  writeFileSync("data/affiliation-approved-backup-2026-07-11.json", JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot of ${snapshot.length} connections written to data/affiliation-approved-backup-2026-07-11.json`);
  console.log("By tag:");
  for (const [t, n] of Object.entries(perTag)) console.log(`  ${t}: ${n}`);

  if (!COMMIT) {
    console.log("\nDry run only -- no writes performed. Re-run with --commit to apply.");
    return;
  }

  // Group program ids by target tag, one tag.update per tag.
  const idsByTag: Record<string, string[]> = {};
  for (const row of snapshot) (idsByTag[row.addTagSlug] ??= []).push(row.programId);

  let total = 0;
  for (const [tagSlug, ids] of Object.entries(idsByTag)) {
    await prisma.tag.update({
      where: { id: tagIdBySlug.get(tagSlug)! },
      data: { programs: { connect: ids.map((id) => ({ id })) } },
    });
    console.log(`Connected ${ids.length} programs to "${tagSlug}".`);
    total += ids.length;
  }

  const stillMissing = await prisma.program.count({
    where: { status: "PUBLISHED", tags: { none: { category: "affiliation" } } },
  });
  console.log(`\nConnections written: ${total} (expected ${entries.length})`);
  console.log(`Published programs still missing an affiliation tag: ${stillMissing}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
