/**
 * Prisma-backed data side of the /match poll rank modifier -- kept separate from the
 * pure math in lib/pollRankModifier.ts (same client-module-split precedent as
 * lib/tagTints.ts / lib/tags.ts) and from lib/pollResults.ts (that module backs the
 * public program-page results grid and the admin "Best for" catalog view; this is the
 * one poll aggregate that exists purely to feed ranking and carries its own cache tag).
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { fetchSiteContent } from "@/lib/siteContent";
import { POLL_KILL_SWITCH_KEY } from "@/lib/pollResults";
import type { PollRankStats } from "@/lib/pollRankModifier";

/** The question key the modifier reads -- see prisma/seed-polls.ts. Resolved through the
 * isCore QuestionBucket (the live "General" bucket) rather than hardcoded to a question
 * id, so a re-seed or a question-id change can't silently break this. */
const RECOMMEND_QUESTION_KEY = "recommend";

export const POLL_RANK_TAG = "poll-rank-stats";

/** The uncached read, exported separately from getPollRankStats below so a plain `tsx`
 * script (e.g. scripts/compare-poll-rank.ts) can call it directly -- unstable_cache
 * requires an active Next request/work-unit store and throws ("Invariant: incrementalCache
 * missing") outside one, which a bare script never has. Application code should still go
 * through getPollRankStats; this export exists for exactly that one offline-script case. */
export async function getPollRankStatsUncached(): Promise<PollRankStats | null> {
  // Deliberately the raw, uncached site-content read (not lib/pollResults.ts's
  // isPollKillSwitchOn), so this function is uncached end-to-end -- see this
  // function's own doc comment above for why that matters.
  if ((await fetchSiteContent(POLL_KILL_SWITCH_KEY)) === "true") return null;

  const coreBucket = await prisma.questionBucket.findFirst({ where: { isCore: true }, select: { questionIds: true } });
  if (!coreBucket) return null;

  const recommendQuestion = await prisma.pollQuestion.findFirst({
    where: { id: { in: coreBucket.questionIds }, key: RECOMMEND_QUESTION_KEY },
    select: { id: true },
  });
  if (!recommendQuestion) return null;

  // Same COUNTED-only scoping as lib/pollResults.ts's listProgramsBestFor -- an
  // INCOMPLETE or VOIDED response's answer must never move a program's rank.
  const rows = await prisma.pollAnswer.findMany({
    where: { questionId: recommendQuestion.id, response: { status: "COUNTED" } },
    select: { value: true, response: { select: { programId: true } } },
  });
  if (rows.length === 0) return { statsByProgramId: {}, catalogMean: null };

  const sumByProgramId: Record<string, { sum: number; n: number }> = {};
  let catalogSum = 0;
  for (const row of rows) {
    const programId = row.response.programId;
    const existing = sumByProgramId[programId] ?? { sum: 0, n: 0 };
    sumByProgramId[programId] = { sum: existing.sum + row.value, n: existing.n + 1 };
    catalogSum += row.value;
  }

  const statsByProgramId: Record<string, { n: number; mean: number }> = {};
  for (const [programId, { sum, n }] of Object.entries(sumByProgramId)) {
    statsByProgramId[programId] = { n, mean: sum / n };
  }

  return { statsByProgramId, catalogMean: catalogSum / rows.length };
}

/** unstable_cache wraps a function with no arguments here (poll-wide, not per-program),
 * same shape as lib/siteContent.ts's getSiteContent. Invalidated by lib/revalidate.ts's
 * revalidateProgram, which already runs on every write path that can change a COUNTED
 * recommend answer (the autosave transition, review moderation) -- over-invalidating a
 * ~300-row aggregate costs nothing. getPollRankStatsUncached's return value is
 * JSON-round-tripped by unstable_cache internally, which is exactly why
 * PollRankStats.statsByProgramId is a plain Record rather than a Map -- see that
 * type's doc comment in lib/pollRankModifier.ts.
 */
export const getPollRankStats = unstable_cache(getPollRankStatsUncached, ["poll-rank-stats"], {
  tags: [POLL_RANK_TAG],
});
