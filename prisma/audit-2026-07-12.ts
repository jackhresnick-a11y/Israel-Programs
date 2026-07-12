import { prisma } from "@/lib/prisma";
import { writeFileSync } from "fs";

/**
 * Read-only audit for the 2026-07-12 data-quality pass. Writes findings to
 * data/audit-2026-07-12-findings.json for review before any fixes are applied.
 */

function findDuplicatedSpan(desc: string): { duplicate: string; cleaned: string } | null {
  const d = desc.trim();
  if (d.length < 80) return null;

  // Whole-description doubling: description is (near-)exactly two copies of the same text.
  const half = Math.floor(d.length / 2);
  for (const splitAt of [half, half + 1, half - 1]) {
    if (splitAt < 40) continue;
    const first = d.slice(0, splitAt).trim();
    const rest = d.slice(splitAt).trim();
    if (first.length > 40 && rest.startsWith(first.slice(0, Math.min(60, first.length)))) {
      return { duplicate: first, cleaned: first };
    }
  }

  // Sentence-level duplication: a sentence (or run of sentences) appears twice.
  const sentences = d.split(/(?<=[.!?])\s+/).filter((s) => s.length > 25);
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      if (sentences[i] === sentences[j]) {
        const cleaned = sentences.filter((s, idx) => !(idx === j && s === sentences[i])).join(" ");
        return { duplicate: sentences[i], cleaned };
      }
    }
  }

  return null;
}

async function main() {
  const programs = await prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      location: true,
      durationType: true,
      organizationId: true,
      tags: { select: { name: true, slug: true, category: true } },
    },
    orderBy: { name: "asc" },
  });

  const findings: Record<string, unknown> = {};

  // 1. Duplicated description text
  const dupHits: { slug: string; name: string; duplicate: string }[] = [];
  for (const p of programs) {
    const hit = findDuplicatedSpan(p.description ?? "");
    if (hit) dupHits.push({ slug: p.slug, name: p.name, duplicate: hit.duplicate.slice(0, 200) });
  }
  findings.duplicatedDescriptions = dupHits;

  // 2. Cost / price mentions (wide net; manual review required, no auto-strip here)
  const costRe =
    /(\$\s?\d|USD|₪|\bNIS\b|\d{1,3}(,\d{3})+\s*(dollars|shekel)|\btuition\b|\bcost[s]?\b|\bprice[s]?\b|\bstipend[s]?\b|\bairfare\b|\bfee[s]?\b|\bfree\b|\binexpensive\b|\baffordable\b|\bscholarship[s]? of\b|\bpaid\b|\bsalary\b|\bwage[s]?\b)/i;
  const costHits: { slug: string; name: string; matched: string[]; description: string }[] = [];
  for (const p of programs) {
    const d = p.description ?? "";
    const matches = d.match(new RegExp(costRe.source, "gi"));
    if (matches) {
      costHits.push({ slug: p.slug, name: p.name, matched: [...new Set(matches.map((m) => m.toLowerCase()))], description: d });
    }
  }
  findings.costMentions = costHits;

  // 3. Missing locations (breaking Region filter — also check location-category tags)
  const missingLoc = programs
    .filter((p) => !p.location || p.location.trim() === "")
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      hasLocationTag: p.tags.some((t) => t.category === "location"),
      locationTags: p.tags.filter((t) => t.category === "location").map((t) => t.slug),
    }));
  findings.missingLocations = missingLoc;

  // 4. Essence tag coverage gaps — keyword-signal vs tag mismatch
  const essenceSignals: { tagSlug: string; re: RegExp }[] = [
    { tagSlug: "essence-academic-internship", re: /\bintern(ship)?s?\b|\bacademic\b|\bcredit\b|\bresearch\b/i },
    { tagSlug: "essence-pre-military", re: /\bmechina\b|\bhesder\b|\bpre-military\b|\bpre-army\b|\bmilitary preparation\b/i },
    { tagSlug: "essence-spiritual-growth", re: /\byeshiva\b|\bmidrasha\b|\bseminary\b|\btorah study\b|\bbeit midrash\b/i },
    { tagSlug: "essence-travel", re: /\btour\b|\btrip\b|\btravel\b|\btouring\b/i },
  ];
  const essenceGaps: Record<string, { slug: string; name: string }[]> = {};
  for (const { tagSlug, re } of essenceSignals) {
    const gaps = programs
      .filter((p) => re.test(`${p.name} ${p.description ?? ""}`) && !p.tags.some((t) => t.slug === tagSlug))
      .map((p) => ({ slug: p.slug, name: p.name }));
    essenceGaps[tagSlug] = gaps;
  }
  findings.essenceCoverageGaps = essenceGaps;
  findings.essenceTagCounts = Object.fromEntries(
    await Promise.all(
      ["essence-spiritual-growth", "essence-academic-internship", "essence-pre-military", "essence-travel"].map(
        async (slug) => [slug, await prisma.program.count({ where: { tags: { some: { slug } } } })]
      )
    )
  );

  // 5. First-person / marketing voice — broad net, needs manual read of hits
  const voiceRe = /\b(we |we're|we've|our |us\b|you'll|you will|join us|your journey|your experience|I \b)/i;
  const voiceHits = programs
    .filter((p) => voiceRe.test(p.description ?? ""))
    .map((p) => ({ slug: p.slug, name: p.name, description: p.description }));
  findings.firstPersonVoiceCandidates = voiceHits;

  // 6. Redundant/conflicting age encoding
  const ageConflicts: { slug: string; name: string; durationType: string; ageTags: string[]; legacyDurationTags: string[] }[] =
    [];
  for (const p of programs) {
    const ageTags = p.tags.filter((t) => t.category === "age").map((t) => t.slug);
    const legacyDurationTags = p.tags.filter((t) => ["10-day", "summer", "semester"].includes(t.slug)).map((t) => t.slug);
    const durationImpliesGapYear = p.durationType === "GAP_YEAR";
    const missingGapYearAgeTag = durationImpliesGapYear && ageTags.length > 0 && !ageTags.includes("age-gap-year");
    if (legacyDurationTags.length > 0 || missingGapYearAgeTag) {
      ageConflicts.push({
        slug: p.slug,
        name: p.name,
        durationType: p.durationType,
        ageTags,
        legacyDurationTags,
      });
    }
  }
  findings.ageEncodingConflicts = ageConflicts;

  // Extra context used in Workstream 2 drafting
  findings.durationTypeCounts = Object.fromEntries(
    (
      await prisma.program.groupBy({ by: ["durationType"], _count: true })
    ).map((r) => [r.durationType, r._count])
  );
  findings.customPrograms = programs
    .filter((p) => p.durationType === "CUSTOM")
    .map((p) => ({ slug: p.slug, name: p.name, description: (p.description ?? "").slice(0, 300) }));

  writeFileSync(
    "/home/jack/israel-programs/data/audit-2026-07-12-findings.json",
    JSON.stringify(findings, null, 2)
  );

  console.log("=== AUDIT SUMMARY ===");
  console.log("Total published programs:", programs.length);
  console.log("Duplicated descriptions:", dupHits.length, dupHits.map((h) => h.slug));
  console.log("Cost-mention candidates:", costHits.length, costHits.map((h) => h.slug));
  console.log("Missing locations:", missingLoc.length, missingLoc.map((h) => h.slug));
  console.log("First-person voice candidates:", voiceHits.length, voiceHits.map((h) => h.slug));
  console.log("Age encoding conflicts:", ageConflicts.length);
  console.log("CUSTOM programs:", findings.customPrograms && (findings.customPrograms as unknown[]).length);
  for (const [k, v] of Object.entries(essenceGaps)) {
    console.log(`Essence gap candidates for ${k}:`, (v as unknown[]).length);
  }
  console.log("\nFull findings written to data/audit-2026-07-12-findings.json");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
