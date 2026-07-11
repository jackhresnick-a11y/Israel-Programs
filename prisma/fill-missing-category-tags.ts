/**
 * Priority 3 fix (audit session 2026-07-11): many programs have no tag at all in a
 * given category (gender/age/essence/israeli-integration/affiliation) simply because
 * one was never generated for them during import/enrichment, making them invisible to
 * that filter dropdown. This adds tags additively, purely on explicit word-boundary
 * signals in the program's own name/description/durationText/goodFor -- never a guess,
 * never external domain knowledge about an institution's reputation (e.g. "Yeshiva
 * University is a men's school" is NOT a signal; the text has to say so itself). Same
 * discipline as prisma/revert-orthodox-affiliation.ts's RZ_SIGNAL.
 *
 * affiliation is deliberately EXCLUDED from all DB writes in this script (both
 * --dry-run and --commit): a prior wholesale orthodox -> rz-modern-orthodox merge was
 * mislabeled and had to be reverted (see revert-orthodox-affiliation.ts), and 55
 * programs already sit in data/affiliation-review-queue.json for manual research.
 * Bulk-affiliation-tagging is exactly the failure mode that caused that incident, so
 * this script only ever *proposes* affiliation matches to
 * data/affiliation-proposals-2026-07-11.json for a human to review -- never writes them.
 *
 * Two-phase like the other prisma/*.ts one-off scripts. Snapshot of every
 * program->tag connection this run WILL make (for the categories that do write) is
 * written before any write, every run.
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/fill-missing-category-tags.ts --dry-run
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/fill-missing-category-tags.ts --commit
 *
 * --dry-run is the default if neither flag is passed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const COMMIT = process.argv.includes("--commit");

type Signal = { tag: string; re: RegExp };

// category -> ordered signal list. A program can match more than one tag within a
// category (e.g. text naming both a men's and women's sub-institution -> coed is
// still preferred as a single explicit signal below, checked first).
const SIGNALS: Record<string, Signal[]> = {
  gender: [
    {
      tag: "coed",
      re: /\bco-?ed\b/i,
    },
    {
      tag: "coed",
      // Explicit branch-for-each-gender language, or naming both a men's and a
      // women's affiliated college/institution in the same program description.
      re: /\bboys'? (branch|campus)\b.*\bgirls'? (branch|campus)\b|\bmen'?s (branch|campus)\b.*\bwomen'?s (branch|campus)\b|yeshiva college and stern college/i,
    },
    {
      tag: "boys-only",
      re: /\byoung men\b|\bfor men\b|\ban all-male\b|\bmale students only\b|\bboys[- ]only\b|\bbachurim\b/i,
    },
    {
      tag: "girls-only",
      re: /\byoung women\b|\bfor women\b|\ban all-female\b|\bfemale students only\b|\bgirls[- ]only\b|\bseminary for women\b|\bwomen'?s seminary\b/i,
    },
  ],
  age: [
    {
      tag: "age-high-school",
      re: /\bhigh school students?\b|\bhigh schoolers\b|\bgrades? 9[\s-]?(to|-)?\s?12\b|\b9th[\s-]?(to|-)?\s?12th grade\b/i,
    },
    {
      tag: "age-gap-year",
      re: /\bgap[\s-]?year\b|\bpost-high-school\b|\b12th-grade graduates\b|\bhigh school graduates\b|\bdeferring (military|army) service\b|\bafter high school\b/i,
    },
    {
      tag: "age-college",
      re: /\bundergraduate(s)?\b|\bcollege students?\b|\buniversity students?\b|\bbachelor'?s\b/i,
    },
    {
      tag: "age-post-college",
      re: /\bpost-college\b|\byoung professionals\b|\bgraduate students?\b|\bmaster'?s\b|\bmfa\b|\bmsc\b|\bphd\b/i,
    },
  ],
  essence: [
    {
      tag: "essence-pre-military",
      // Negative lookahead on "Mechina Olamit" -- that's the proper name of a distinct
      // sibling World Bnei Akiva program (see kadima/torani/limmud-world-bnei-akiva
      // Program rows), not a description of the program being scanned.
      re: /\bpre-military\b|\bpre-army\b|\bmechina\b(?!\s+olamit)/i,
    },
    {
      tag: "essence-academic-internship",
      re: /\binternship\b|\bacademic (program|research)\b|\bresearch (program|internship|placement|project)\b|\bdegree program\b|\bstudy abroad\b|\bexcavation\b|\barchaeological\b|\bcollege credit\b|\buniversity credit\b/i,
    },
    {
      tag: "essence-spiritual-growth",
      re: /\byeshiva\b|\bseminary\b|\bbeit midrash\b|\bmidrasha\b|\btorah study\b|\bhalach(a|ic)\b|\btalmud(ic)?\b/i,
    },
    {
      tag: "essence-travel",
      re: /\btouring\b|\btrek\b|\btravel(l)?ing\b|\bsightseeing\b|\broad trip\b/i,
    },
  ],
  "israeli-integration": [
    {
      tag: "integration-high",
      re: /\blive(s|d)? alongside israelis\b|\bintegrat(e|ing|ed) (fully )?(with|into) israeli (society|peers|students|soldiers)\b|\bisraeli roommates\b|\bserve alongside israelis\b/i,
    },
    {
      tag: "integration-low",
      re: /\ball-anglo\b|\benglish-speaking bubble\b|\bno hebrew required\b|\bamerican students only\b/i,
    },
  ],
};

// Affiliation is proposal-only -- never written to the DB by this script.
const AFFILIATION_SIGNALS: Signal[] = [
  { tag: "rz-modern-orthodox", re: /religious[\s-]?zionis[tm]/i },
  { tag: "rz-modern-orthodox", re: /modern[\s-]?orthodox/i },
  { tag: "rz-modern-orthodox", re: /\bhesder\b/i },
  { tag: "rz-modern-orthodox", re: /bnei\s+akiva/i },
  { tag: "harediultra-orthodoxyeshivish", re: /\blitvish\b|\bharedi\b|\bultra-orthodox\b|\byeshivish\b/i },
  { tag: "non-affiliated-religously", re: /\bnon-denominational\b|\bunaffiliated\b|\bsecular\b/i },
  { tag: "flexible-religously", re: /\bpluralistic\b|\bflexible\b/i },
  { tag: "mixed-religously", re: /\bmixed (religious|denominational) backgrounds?\b/i },
];

function firstMatch(text: string, signals: Signal[]): string | null {
  for (const { tag, re } of signals) {
    if (re.test(text)) return tag;
  }
  return null;
}

// Hand-reviewed exclusions: the regex technically matches, but the matched phrase
// describes a *different*, separately-named sibling program in the same description,
// not the program being scanned -- e.g. "Hesder Yeshiva Akko" mentions it "runs...
// programs for local university students" (an outreach activity for others, not its
// own participants' age), and the Haifa summer ulpan explicitly says it's "separate
// from the Study Abroad, BA, and Master's programs" (naming siblings it is NOT).
const EXCLUDE: Set<string> = new Set([
  "age:hesder-yeshiva-akko",
  "essence:otzma",
  "age:university-of-haifa-intensive-hebrew-summer-ulpan",
  "essence:university-of-haifa-intensive-hebrew-summer-ulpan",
]);

async function main() {
  const categories = Object.keys(SIGNALS);
  const connectionsByTag: Record<string, { id: string; slug: string }[]> = {};
  const stillUntaggedByCategory: Record<string, number> = {};

  for (const category of categories) {
    const missing = await prisma.program.findMany({
      where: { status: "PUBLISHED", tags: { none: { category } } },
      select: { id: true, slug: true, name: true, description: true, durationText: true, goodFor: true },
      orderBy: { slug: "asc" },
    });

    let matchedCount = 0;
    for (const p of missing) {
      const text = [p.name, p.description, p.durationText, p.goodFor].filter(Boolean).join(" \n ");
      const tag = firstMatch(text, SIGNALS[category]);
      if (tag && EXCLUDE.has(`${category}:${p.slug}`)) {
        console.log(`  (excluded false-positive match: ${category}/${tag} on ${p.slug})`);
      } else if (tag) {
        connectionsByTag[tag] ??= [];
        connectionsByTag[tag].push({ id: p.id, slug: p.slug });
        matchedCount++;
      }
    }
    stillUntaggedByCategory[category] = missing.length - matchedCount;
    console.log(`${category}: ${missing.length} missing, ${matchedCount} matched an explicit signal`);
  }

  // Affiliation: proposal file only, never a DB write, regardless of --commit.
  const missingAffiliation = await prisma.program.findMany({
    where: { status: "PUBLISHED", tags: { none: { category: "affiliation" } } },
    select: { slug: true, name: true, description: true },
    orderBy: { slug: "asc" },
  });
  const existingQueue: { slug: string }[] = JSON.parse(
    readFileSync("data/affiliation-review-queue.json", "utf-8")
  );
  const alreadyQueued = new Set(existingQueue.map((r) => r.slug));
  const affiliationProposals = missingAffiliation
    .map((p) => {
      const text = [p.name, p.description].filter(Boolean).join(" \n ");
      const tag = firstMatch(text, AFFILIATION_SIGNALS);
      return tag ? { slug: p.slug, name: p.name, proposedTag: tag, alreadyInReviewQueue: alreadyQueued.has(p.slug) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  writeFileSync(
    "data/affiliation-proposals-2026-07-11.json",
    JSON.stringify(affiliationProposals, null, 2)
  );
  console.log(
    `\naffiliation: ${missingAffiliation.length} missing, ${affiliationProposals.length} explicit-signal proposals written to data/affiliation-proposals-2026-07-11.json (NOT written to DB -- review required)`
  );

  console.log("\nProposed connections by tag (gender/age/essence/israeli-integration only):");
  for (const [tag, progs] of Object.entries(connectionsByTag)) {
    console.log(`  ${tag}: ${progs.length} programs`);
  }

  const snapshot = Object.entries(connectionsByTag).flatMap(([tag, progs]) =>
    progs.map((p) => ({ tagSlug: tag, programSlug: p.slug, programId: p.id }))
  );
  writeFileSync(
    "data/category-tags-backup-2026-07-11.json",
    JSON.stringify(snapshot, null, 2)
  );
  console.log(`\nSnapshot of ${snapshot.length} proposed connections written to data/category-tags-backup-2026-07-11.json`);

  if (!COMMIT) {
    console.log("\nDry run only -- no writes performed. Re-run with --commit to apply.");
    return;
  }

  const existingTags = await prisma.tag.findMany({
    where: { slug: { in: Object.keys(connectionsByTag) } },
    select: { id: true, slug: true },
  });
  const tagIdBySlug = new Map(existingTags.map((t) => [t.slug, t.id]));

  let totalConnected = 0;
  for (const [tag, progs] of Object.entries(connectionsByTag)) {
    const tagId = tagIdBySlug.get(tag);
    if (!tagId) {
      console.error(`ERROR: expected existing tag "${tag}" not found -- skipping, no write for it.`);
      continue;
    }
    await prisma.tag.update({
      where: { id: tagId },
      data: { programs: { connect: progs.map((p) => ({ id: p.id })) } },
    });
    console.log(`Connected ${progs.length} programs to tag "${tag}".`);
    totalConnected += progs.length;
  }
  console.log(`\nConnections written: ${totalConnected}`);

  for (const category of categories) {
    const stillMissing = await prisma.program.count({
      where: { status: "PUBLISHED", tags: { none: { category } } },
    });
    console.log(`${category}: still missing after write = ${stillMissing} (expected ~${stillUntaggedByCategory[category]})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
