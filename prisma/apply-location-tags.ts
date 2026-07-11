/**
 * Priority 2 fix (audit session 2026-07-11): Region filter dropdown is data-sparse, not
 * broken -- only 133/362 published programs carry any location-category tag (92 of
 * those just "jerusalem"). Region itself is a sound UI grouping over location-category
 * tags via Region.memberSlugs (see CLAUDE.md "Browse filters"); it just has nothing to
 * group for most programs. This script connects the 6 existing location tags
 * (jerusalem, coastal-israel, northern-israel, southern-israel, samaria,
 * ramat-hasharon) onto published programs whose freeform `location` string names a
 * place within that tag's area, using an explicit, hand-reviewed keyword list built
 * from Israeli city/region names actually observed across all 229 missing-location-tag
 * strings (see data/missing-location-strings-2026-07-11.json for the reviewed dump).
 *
 * Deliberately conservative: never mints a new tag value, never touches strings with no
 * confidently-classifiable place name (generic "Israel"/"Israel-wide"/"Multiple cities"
 * strings, or Judea/West-Bank locations like Gush Etzion/Hebron-hills/Ma'ale Adumim for
 * which no existing tag fits -- there's no "Judea" tag and guessing one onto "jerusalem"
 * or "samaria" would misrepresent the geography). Unmatched rows are logged to
 * data/location-tags-unmatched-2026-07-11.json for a human to review/tag manually via
 * the admin Tag manager, not silently dropped.
 *
 * Two-phase like the other prisma/*.ts one-off scripts in this repo. Snapshot of every
 * program->tag connection this run WILL make is written before any write, every run.
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/apply-location-tags.ts --dry-run
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/apply-location-tags.ts --commit
 *
 * --dry-run is the default if neither flag is passed.
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const COMMIT = process.argv.includes("--commit");

// Word-boundary place-name signals -> location tag slug. Order doesn't matter; a
// program can match more than one region (e.g. "Jerusalem, Tel Aviv" gets both), same
// as several already-tagged programs in the live data (Ulpan Etzion, Artzi, CAMERA
// Fellows all carry multiple region tags).
const REGION_SIGNALS: Record<string, RegExp> = {
  jerusalem: /\bjerusalem\b|\byerushalayim\b|\bmevaseret zion\b|\bbeit shemesh\b|\bkiryat ye'?arim\b/i,
  samaria:
    /\bariel\b|\bkarnei shomron\b|\bshomron\b|\bsamaria\b|\bitamar\b|\bhar bracha\b|\bshavei shomron\b|\balon moreh\b|\bpeduel\b|\bkfar tapuach\b|\bbeit el\b|\bbinyamin\b|\beli\b|\bshiloh?\b/i,
  "northern-israel":
    /\bhaifa\b|\btzfat\b|\bsafed\b|\bgolan\b|\bgalilee\b|\bkinneret\b|\bsea of galilee\b|\bakko\b|\bacre\b|\bnof hagalil\b|\bnazareth illit\b|\bkiryat shmona\b|\bafula\b|\bbeit she'?an\b|\bhatzor\b|\bkatzrin\b|\bjezreel valley\b|\byizrael valley\b|\brosh hanikra\b|\bharduf\b|\blohamei hageta'?ot\b|\bmaalot\b|\bdaliyat al-?karmel\b|\bhadera\b|\btiberias\b|\bkarmiel\b|\bnorthern jordan valley\b|\bhippos-?sussita\b|\bchof hacarmel\b|\bma'?agan michael\b|\bein hashofet\b|\bgilboa\b|\bor akiva\b|\bnorthern israel\b/i,
  "southern-israel":
    /\bnegev\b|\beilat\b|\barava\b|\bbe'?er.?sheva\b|\bbeersheba\b|\bdimona\b|\bsderot\b|\bnetivot\b|\bofakim\b|\bkiryat gat\b|\bashkelon\b|\barad\b|\bnitzana\b|\bsde boker\b|\bmitzpe ramon\b|\bein-?gedi\b|\bmitzpe shalem\b|\bchalutza\b|\bnir oz\b|\bgaza envelope\b|\bsouthern israel\b/i,
  "coastal-israel":
    /\btel aviv\b|\bjaffa\b|\byafo\b|\bramat gan\b|\bherzliya\b|\bra'?anana\b|\brehovot\b|\bhod hasharon\b|\bnetanya\b|\bholon\b|\brishon lezion\b|\bkiryat ono\b|\bor yehuda\b|\bbat yam\b|\bbnei brak\b|\byavne\b|\bramla\b|\brosh ha'?ayin\b|\bmodi'?in\b/i,
  "ramat-hasharon": /\bramat hasharon\b/i,
};

async function main() {
  const missing = await prisma.program.findMany({
    where: { status: "PUBLISHED", tags: { none: { category: "location" } } },
    select: { id: true, slug: true, name: true, location: true },
    orderBy: { slug: "asc" },
  });

  const matches: Record<string, { id: string; slug: string }[]> = {};
  const unmatched: { slug: string; name: string; location: string | null }[] = [];

  for (const program of missing) {
    const loc = program.location ?? "";
    const tagsForProgram = Object.entries(REGION_SIGNALS)
      .filter(([, re]) => re.test(loc))
      .map(([slug]) => slug);

    if (tagsForProgram.length === 0) {
      unmatched.push({ slug: program.slug, name: program.name, location: program.location });
      continue;
    }
    for (const slug of tagsForProgram) {
      matches[slug] ??= [];
      matches[slug].push({ id: program.id, slug: program.slug });
    }
  }

  console.log("Proposed connections by tag:");
  for (const [slug, progs] of Object.entries(matches)) {
    console.log(`  ${slug}: ${progs.length} programs`);
  }
  console.log(`\nUnmatched (left untagged, needs manual review): ${unmatched.length}`);

  writeFileSync(
    "data/location-tags-unmatched-2026-07-11.json",
    JSON.stringify(unmatched, null, 2)
  );
  console.log("Unmatched list written to data/location-tags-unmatched-2026-07-11.json");

  const snapshot = Object.entries(matches).flatMap(([slug, progs]) =>
    progs.map((p) => ({ tagSlug: slug, programSlug: p.slug, programId: p.id }))
  );
  writeFileSync(
    "data/location-tags-backup-2026-07-11.json",
    JSON.stringify(snapshot, null, 2)
  );
  console.log(`Snapshot of ${snapshot.length} proposed connections written to data/location-tags-backup-2026-07-11.json`);

  if (!COMMIT) {
    console.log("\nDry run only -- no writes performed. Re-run with --commit to apply.");
    return;
  }

  const existingTags = await prisma.tag.findMany({
    where: { slug: { in: Object.keys(matches) }, category: "location" },
    select: { id: true, slug: true },
  });
  const tagIdBySlug = new Map(existingTags.map((t) => [t.slug, t.id]));

  let totalConnected = 0;
  for (const [slug, progs] of Object.entries(matches)) {
    const tagId = tagIdBySlug.get(slug);
    if (!tagId) {
      console.error(`ERROR: expected existing location tag "${slug}" not found -- skipping, no write for it.`);
      continue;
    }
    await prisma.tag.update({
      where: { id: tagId },
      data: { programs: { connect: progs.map((p) => ({ id: p.id })) } },
    });
    console.log(`Connected ${progs.length} programs to tag "${slug}".`);
    totalConnected += progs.length;
  }

  const stillMissing = await prisma.program.count({
    where: { status: "PUBLISHED", tags: { none: { category: "location" } } },
  });
  console.log(`\nConnections written: ${totalConnected}`);
  console.log(`Programs still missing a location tag (expected ~${unmatched.length}): ${stillMissing}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
