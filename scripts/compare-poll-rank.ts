/**
 * Read-only before/after report for the /match poll rank modifier
 * (lib/pollRankModifier.ts, wired into lib/flowRank.ts's rankPrograms via
 * lib/flowRun.ts's runMatchResults). Runs 5 hardcoded FlowAnswerStates through the
 * real ranking pipeline twice -- once with rankPrograms's optional pollModifier
 * argument omitted (today's behavior) and once with the live poll data applied --
 * and prints a top-15 diff for each: rank, program, baseScore, multiplier, final
 * score, rank delta, and the underlying (n, avg) the multiplier came from.
 *
 * Deliberately does NOT import lib/flowRun.ts's runMatchResults: that module imports
 * `after` from "next/server" at module scope and calls the cached getPollRankStats
 * (wrapped in next/cache's unstable_cache, which throws outside an active Next
 * request/work-unit store -- exactly the environment a bare `tsx` script runs in).
 * Instead this composes the same underlying pieces runMatchResults does --
 * resolveFlow -> buildFlowRunInput -> listPrograms/listAllTags -> survivingPrograms
 * -> rankPrograms -- directly, using lib/pollRankData.ts's getPollRankStatsUncached
 * for the live data. Same code path as production; no next/server/next/cache
 * dependency.
 *
 * MODIFIES NOTHING. Run:
 *   set -a && source .env && source .env.local && set +a
 *   npx tsx scripts/compare-poll-rank.ts
 */
import { writeFileSync } from "fs";
import { resolveFlow, type FlowAnswerState, type FlowQuestionDTO } from "@/lib/flowShared";
import { buildFlowRunInput, survivingPrograms, rankPrograms, type MatchBand } from "@/lib/flowRank";
import { listFlowQuestions } from "@/lib/flow";
import { listPrograms, listAllTags } from "@/lib/programs";
import { getPollRankStatsUncached } from "@/lib/pollRankData";
import { makePollModifier } from "@/lib/pollRankModifier";

const TOP_N = 15;

type SampleQuery = { title: string; description: string; answers: [string, string[]][] };

// 5 sample queries chosen to exercise every distinct path through rankPrograms:
// two different REQUIRE eliminators (1, 2), a multi-positive-criteria run (3), the
// sign-safety path via a negative-weight criterion (4), and a broad, duration-only,
// low-signal pool (5). Option/question keys are the live ACTIVE FlowQuestion set as
// of 2026-08-16 (see prisma/schema.prisma's FlowQuestion/FlowOption models).
const SAMPLE_QUERIES: SampleQuery[] = [
  {
    title: "1. Gap-year Israeli yeshiva, boys-only",
    description: "Exercises a REQUIRE eliminator (gender).",
    answers: [
      ["what-stage-will-you-be-in-when-you-go", ["right-after-high-school"]],
      ["what-kind-of-program-are-you-looking-for", ["boys-only"]],
      ["what-kind-of-program", ["israeli-yeshiva"]],
      ["how-do-you-feel-about-sitting-and-learning", ["i-love-it"]],
    ],
  },
  {
    title: "2. Post-high-school American seminary, girls-only",
    description: "A second REQUIRE eliminator, different tag category (gender, opposite value).",
    answers: [
      ["what-stage-will-you-be-in-when-you-go", ["right-after-high-school"]],
      ["what-kind-of-program-are-you-looking-for", ["girls-only"]],
      ["what-kind-of-program", ["american-seminary"]],
      ["how-do-you-feel-about-sitting-and-learning", ["i-love-it"]],
    ],
  },
  {
    title: "3. Pre-army religious mechina",
    description: "Multiple positive criteria (army + a-year-first + religious-mechina).",
    answers: [
      ["what-stage-will-you-be-in-when-you-go", ["right-after-high-school"]],
      ["what-kind-of-program-are-you-looking-for", ["no-preference"]],
      ["are-you-planning-to-serve", ["army"]],
      ["when-would-you-want-to-start-serving", ["a-year-first"]],
      ["what-kind-of-program", ["religious-mechina"]],
    ],
  },
  {
    title: "4. College-semester travel programme, but 'school killed it for me'",
    description: "The sign-safety path: a negative-weight criterion, negative baseScores.",
    answers: [
      ["what-stage-will-you-be-in-when-you-go", ["during-college-a-full-semester-or-year"]],
      ["what-kind-of-program-are-you-looking-for", ["no-preference"]],
      ["what-kind-of-program", ["experience-travel-focused"]],
      ["how-do-you-feel-about-sitting-and-learning", ["school-killed-it-for-me"]],
    ],
  },
  {
    title: "5. College-summer academic/college-credit, no gender preference",
    description: "Duration-only + one broad criterion -- a low-signal pool.",
    answers: [
      ["what-stage-will-you-be-in-when-you-go", ["during-college-summer-or-between-semesters"]],
      ["what-kind-of-program-are-you-looking-for", ["no-preference"]],
      ["what-kind-of-program", ["academic-college-credit"]],
    ],
  },
];

function fmt(n: number): string {
  return n.toFixed(4);
}

/** Neon's serverless endpoint can take several seconds to wake from cold, which reads
 * as a plain connection ETIMEDOUT on the first query of a session -- retry a few times
 * with a short backoff rather than failing the whole report over a cold start. */
async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 4): Promise<T> {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      console.error(`${label}: attempt ${i}/${attempts} failed (${(err as Error).message.split("\n")[0]}), retrying...`);
      await new Promise((resolve) => setTimeout(resolve, i * 3000));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const questionRows = await withRetry(() => listFlowQuestions(), "listFlowQuestions");
  const programs = await withRetry(() => listPrograms({}), "listPrograms");
  const tags = await withRetry(() => listAllTags(), "listAllTags");
  const pollStats = await withRetry(() => getPollRankStatsUncached(), "getPollRankStatsUncached");
  const questions = questionRows as unknown as FlowQuestionDTO[];
  const tagCategoryBySlug = new Map(tags.map((t) => [t.slug, t.category]));
  const matchPrograms = programs.map((p) => ({ ...p, tagSlugs: p.tags.map((t) => t.slug) }));

  console.log(
    pollStats === null
      ? "poll stats: null (kill switch on, or no recommend question/answers -- every multiplier will be exactly 1)"
      : `poll stats: catalogMean=${fmt(pollStats.catalogMean ?? NaN)}, programs with data=${Object.keys(pollStats.statsByProgramId).length}`
  );

  const pollModifier = makePollModifier(pollStats);
  const sections: string[] = [];
  sections.push(
    "# Poll rank modifier -- before/after\n",
    `Generated ${new Date().toISOString()}. ${matchPrograms.length} published programs. ` +
      (pollStats
        ? `Catalog mean (recommend, per-answer): ${fmt(pollStats.catalogMean ?? NaN)}. Programs with recommend data: ${Object.keys(pollStats.statsByProgramId).length}.\n`
        : "Poll stats unavailable (kill switch on, or no data) -- every multiplier is exactly 1, so off/on are identical.\n")
  );

  for (const query of SAMPLE_QUERIES) {
    const state: FlowAnswerState = new Map(query.answers);
    const { visible } = resolveFlow(questions, state, null);
    const { criteria, requireTargets } = buildFlowRunInput(visible, state);
    const survivors = survivingPrograms(matchPrograms, requireTargets, tagCategoryBySlug);

    const off = rankPrograms(survivors, criteria, tagCategoryBySlug);
    const on = rankPrograms(survivors, criteria, tagCategoryBySlug, pollModifier);

    const offRankById = new Map(off.map((r, i) => [r.program.id, i + 1]));

    sections.push(`\n## ${query.title}\n\n${query.description}\n`);
    sections.push(`Survivors: ${survivors.length} / ${matchPrograms.length}\n`);
    sections.push(
      "| Rank | Program | baseScore | mult | score | Δrank | n | avg |",
      "|---|---|---|---|---|---|---|---|"
    );
    on.slice(0, TOP_N).forEach((r, i) => {
      const rank = i + 1;
      const offRank = offRankById.get(r.program.id) ?? "-";
      const delta = typeof offRank === "number" ? offRank - rank : 0;
      const deltaStr = delta === 0 ? "=" : delta > 0 ? `↑${delta}` : `↓${-delta}`;
      const stat = pollStats?.statsByProgramId[r.program.id];
      sections.push(
        `| ${rank} | ${r.program.name} | ${fmt(r.baseScore)} | ${fmt(r.pollMultiplier)} | ${fmt(r.score)} | ${deltaStr} | ${stat?.n ?? 0} | ${stat ? fmt(stat.mean) : "-"} |`
      );
    });

    const bandCountsOff = countBands(off);
    const bandCountsOn = countBands(on);
    sections.push(
      "",
      `Band counts unchanged: strong ${bandCountsOff.strong}→${bandCountsOn.strong}, ` +
        `partial ${bandCountsOff.partial}→${bandCountsOn.partial}, weak ${bandCountsOff.weak}→${bandCountsOn.weak}, ` +
        `unranked ${bandCountsOff.unranked}→${bandCountsOn.unranked} (must always match -- the modifier reorders, never re-bands).`
    );
  }

  const output = sections.join("\n") + "\n";
  const outPath = new URL("../docs/poll-rank-modifier-before-after.md", import.meta.url);
  writeFileSync(outPath, output);
  console.log(`\nWrote ${output.length} bytes to ${outPath.pathname}`);
}

function countBands<T extends { band: MatchBand }>(results: T[]): Record<MatchBand, number> {
  const counts: Record<MatchBand, number> = { strong: 0, partial: 0, weak: 0, unranked: 0 };
  for (const r of results) counts[r.band]++;
  return counts;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
  });
