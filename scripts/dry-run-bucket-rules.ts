/**
 * Read-only dry run for poll restructure item 3 (bucket-rule rebuild). For every
 * published program: today's live-resolved extra buckets, the proposed buckets under
 * the new model (General + Conditions always-on, hard cap of 3 additional), and the
 * tags/durationType driving that proposal -- or an explicit AMBIGUOUS flag when the
 * available tag signal doesn't cleanly support a classification, per the instruction to
 * flag rather than guess.
 *
 * MODIFIES NOTHING. Run:
 *   set -a && source .env && source .env.local && set +a
 *   npx tsx scripts/dry-run-bucket-rules.ts > research/bucket-rule-dry-run-2026-07-31.md
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getQuestionsForProgram } from "../lib/pollConfig";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

type AdditionalBucket =
  | "Torah Learning"
  | "Pre-Military"
  | "Social Life"
  | "Hebrew Learning"
  | "Staying in Israel/Aliyah"
  | "Academic/Internship";

type Proposal =
  | { kind: "proposed"; category: string; buckets: AdditionalBucket[]; signal: string }
  | { kind: "ambiguous"; reason: string; signal: string };

const RELIGIOUS_AFFILIATION_TAGS = new Set([
  "rz-modern-orthodox",
  "harediultra-orthodoxyeshivish",
  "litvish",
  "sephardic",
  "chabad",
]);
const SECULAR_LEANING_TAGS = new Set(["socialist-zionism", "labor-zionism", "zionism"]);

function classify(tags: string[], durationType: string): Proposal {
  const t = new Set(tags);
  const has = (s: string) => t.has(s);
  const hasAny = (set: Set<string>) => [...set].some((s) => t.has(s));

  // Hesder -- dedicated, unambiguous tag. Required buckets per the brief.
  if (has("hesder")) {
    return {
      kind: "proposed",
      category: "Hesder",
      buckets: ["Torah Learning", "Pre-Military", "Staying in Israel/Aliyah"],
      signal: "hesder",
    };
  }

  // Mechina -- religious vs secular hinges on affiliation signal, which not every
  // mechina-tagged program carries. Required buckets per the brief for the religious
  // case; secular is a proposed default.
  if (has("mechina")) {
    if (hasAny(RELIGIOUS_AFFILIATION_TAGS)) {
      return {
        kind: "proposed",
        category: "Religious mechina",
        buckets: ["Torah Learning", "Pre-Military", "Social Life"],
        signal: `mechina + ${[...RELIGIOUS_AFFILIATION_TAGS].filter((s) => t.has(s)).join(",")}`,
      };
    }
    if (hasAny(SECULAR_LEANING_TAGS)) {
      return {
        kind: "proposed",
        category: "Secular mechina",
        buckets: ["Pre-Military", "Social Life", "Staying in Israel/Aliyah"],
        signal: `mechina + ${[...SECULAR_LEANING_TAGS].filter((s) => t.has(s)).join(",")}`,
      };
    }
    return {
      kind: "ambiguous",
      reason: "mechina tag present but no religious-affiliation or secular-Zionist tag to pick Religious vs Secular",
      signal: "mechina",
    };
  }

  // Yeshiva (gap year) -- dedicated tag, not already caught by hesder above.
  if (has("yeshiva") || has("yeshiva-gevoha")) {
    return {
      kind: "proposed",
      category: "Yeshiva (gap year)",
      buckets: ["Torah Learning", "Social Life", "Hebrew Learning"],
      signal: has("yeshiva") ? "yeshiva" : "yeshiva-gevoha",
    };
  }

  // Aliyah/integration -- the `aliyah` tag is a direct, dedicated signal.
  if (has("aliyah")) {
    return {
      kind: "proposed",
      category: "Aliyah / integration",
      buckets: ["Staying in Israel/Aliyah", "Hebrew Learning", "Social Life"],
      signal: "aliyah",
    };
  }

  // Summer program -- durationType is a typed column, not an auto-generated tag, and is
  // the most reliable signal in this whole classifier.
  if (durationType === "SUMMER") {
    return {
      kind: "proposed",
      category: "Summer program",
      buckets: ["Social Life", "Hebrew Learning", "Staying in Israel/Aliyah"],
      signal: "durationType=SUMMER",
    };
  }

  // Academic/semester vs Internship -- both plausibly carry essence-academic-internship
  // with no tag distinguishing them. Never guessed; always flagged.
  if (has("essence-academic-internship")) {
    return {
      kind: "ambiguous",
      reason:
        "essence-academic-internship present but no tag distinguishes Academic/semester from Internship (both draw from the same tag)",
      signal: `essence-academic-internship, durationType=${durationType}`,
    };
  }

  // No tag in the taxonomy identifies a Seminary specifically (see the report's methodology
  // note) -- never guessed from girls-only/spiritual-growth alone.
  if (has("girls-only") && has("essence-spiritual-growth")) {
    return {
      kind: "ambiguous",
      reason: "girls-only + spiritual-growth is the closest available proxy for Seminary, but no dedicated tag exists -- not classified automatically",
      signal: "girls-only, essence-spiritual-growth",
    };
  }

  return {
    kind: "ambiguous",
    reason: "no tag or durationType signal matches any of the 9 default-map categories",
    signal: tags.length > 0 ? tags.join(", ") : "(no tags)",
  };
}

async function main() {
  const [rules, buckets, programs] = await Promise.all([
    prisma.bucketAttachmentRule.findMany({ where: { status: "ACTIVE" } }),
    prisma.questionBucket.findMany({ select: { id: true, name: true, isCore: true } }),
    prisma.program.findMany({
      where: { status: "PUBLISHED" },
      select: {
        id: true,
        slug: true,
        name: true,
        durationType: true,
        tags: { select: { slug: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const bucketNameById = new Map(buckets.map((b) => [b.id, b.name]));
  const STRUCTURAL_TAGS = new Set(["semester", "age-gap-year", "overseas-program", "integration-high"]);

  const lines: string[] = [];
  lines.push("# Bucket rule dry run (item 3)");
  lines.push("");
  lines.push(
    "Read-only. Generated by `scripts/dry-run-bucket-rules.ts` -- nothing here was written to the database. Every program below is listed for review; nothing is applied until approved."
  );
  lines.push("");

  // --- Rules classified as padding / structural-tag-keyed ---
  lines.push("## Rules flagged for deletion");
  lines.push("");
  lines.push(
    "Two groups: (a) rules keyed to a purely structural tag named in the brief (`#semester`, `#age-gap-year`, `#overseas-program`, `#integration-high`), and (b) rules whose match rate across published programs is high enough that they read as padding -- attaching almost regardless of a program's actual character -- rather than a genuine topical match. Match rate is share of the 460 published programs the rule's own condition matches (not yet accounting for other rules or manual overrides)."
  );
  lines.push("");
  lines.push("| Bucket | Condition | Matches | Match rate | Classification |");
  lines.push("|---|---|---|---|---|");
  for (const r of rules) {
    const matchCount = programs.filter((p) => {
      const slugs = new Set(p.tags.map((t) => t.slug));
      const tagsOk = r.tagSlugs.every((s) => slugs.has(s));
      const durOk = r.durationTypes.length === 0 || r.durationTypes.includes(p.durationType);
      return tagsOk && durOk;
    }).length;
    const rate = ((matchCount / programs.length) * 100).toFixed(0);
    const isStructural = r.tagSlugs.some((s) => STRUCTURAL_TAGS.has(s));
    const isHighMatch = matchCount / programs.length > 0.5;
    const classification = isStructural
      ? "structural tag -- flagged for deletion"
      : isHighMatch
        ? "high match rate -- padding candidate, flag for deletion"
        : "topical -- keep";
    const condition = [
      ...r.tagSlugs.map((s) => `#${s}`),
      ...r.durationTypes.map((d) => `duration=${d}`),
    ].join(" AND ");
    lines.push(`| ${bucketNameById.get(r.bucketId) ?? "?"} | ${condition} | ${matchCount} | ${rate}% | ${classification} |`);
  }
  lines.push("");

  // --- Per-program dry run ---
  lines.push("## Per-program dry run");
  lines.push("");
  lines.push("| Program | Current extra buckets | Proposed category | Proposed additional buckets | Signal |");
  lines.push("|---|---|---|---|---|");

  let ambiguousCount = 0;
  const ambiguousReasons = new Map<string, number>();

  for (const p of programs) {
    const resolved = await getQuestionsForProgram(p.id);
    const currentExtras = resolved.extras.map((e) => e.bucket.name).join(", ") || "(none)";
    const tagSlugs = p.tags.map((t) => t.slug);
    const proposal = classify(tagSlugs, p.durationType);

    if (proposal.kind === "ambiguous") {
      ambiguousCount++;
      ambiguousReasons.set(proposal.reason, (ambiguousReasons.get(proposal.reason) ?? 0) + 1);
      lines.push(
        `| ${p.name} | ${currentExtras} | **AMBIGUOUS** | — | ${proposal.reason} (tags: ${proposal.signal}) |`
      );
    } else {
      lines.push(
        `| ${p.name} | ${currentExtras} | ${proposal.category} | ${proposal.buckets.join(", ")} | ${proposal.signal} |`
      );
    }
  }
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`- ${programs.length} published programs reviewed.`);
  lines.push(`- ${programs.length - ambiguousCount} classified with a proposed category.`);
  lines.push(`- ${ambiguousCount} flagged AMBIGUOUS (no automatic proposal).`);
  lines.push("");
  lines.push("Ambiguous breakdown:");
  lines.push("");
  for (const [reason, count] of [...ambiguousReasons.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${count}× ${reason}`);
  }
  lines.push("");
  lines.push(
    "**Methodology note on Seminary**: no tag in the current 94-tag taxonomy identifies a seminary specifically (a women's post-high-school Torah-study program, the female counterpart to a yeshiva). `girls-only` + `essence-spiritual-growth` is the closest available proxy, but plenty of non-seminary programs could carry that same pair, so those programs are flagged AMBIGUOUS rather than auto-classified as Seminary. If a `seminary` tag should exist, that's a tagging-taxonomy decision, not something this script should invent."
  );
  lines.push("");
  lines.push(
    "**Methodology note on Academic/semester vs Internship**: both draw on the single `essence-academic-internship` tag; nothing in the tag set distinguishes them, so every program carrying that tag is flagged AMBIGUOUS rather than guessed."
  );

  console.log(lines.join("\n"));
  await prisma.$disconnect();
}

main();
