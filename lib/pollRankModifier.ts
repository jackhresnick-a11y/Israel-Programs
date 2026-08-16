/**
 * Pure, Prisma-free math for the /match ranking pipeline's confidence-weighted poll
 * nudge -- no Prisma import, safe for any "use client" component, same split as
 * lib/pollBestFor.ts. Turns a program's raw (n, mean) on the General bucket's Recommend
 * question into a bounded multiplier lib/flowRank.ts's rankPrograms applies on top of the
 * tag/duration score. The DB read that produces PollRankStats lives in lib/pollRankData.ts,
 * kept separate so this module -- and anything that imports it -- never drags in
 * lib/prisma.ts.
 */

/** Shrinkage strength: how many "catalog-average" answers a program's own average is
 * weighted against before it's trusted. The ONE place this number lives -- retune by
 * editing it, nothing else hardcodes it. Chosen so a program needs a real handful of
 * responses before its multiplier moves meaningfully; see docs/poll-rank-modifier-before-after.md
 * for what this produces against the live response distribution. */
export const POLL_SHRINKAGE_M = 15;

/** The multiplier's bound, expressed as a fraction of the program's own tag/duration
 * score -- never a fixed number of score points. See applyPollMultiplier in
 * lib/flowRank.ts for how this is applied sign-safely to a possibly-negative score. */
export const MAX_POLL_ADJUSTMENT = 0.1;

/** Recommend-question stats folded per program, plus the catalog-wide mean the shrinkage
 * formula pulls every program toward. `catalogMean` is null when there are no COUNTED
 * recommend answers anywhere yet (a cold catalog) -- every program is neutral in that
 * state, same as n = 0. A plain Record, not a Map: lib/pollRankData.ts's getPollRankStats
 * is wrapped in unstable_cache, which serializes its return value through
 * JSON.stringify/JSON.parse (see node_modules/next/dist/server/web/spec-extension/
 * unstable-cache.js) -- a Map round-trips to `{}` there, silently losing every entry, so
 * this type must stay JSON-safe. */
export type PollRankStats = {
  statsByProgramId: Record<string, { n: number; mean: number }>;
  catalogMean: number | null;
};

/**
 * weighted = (n * avg + M * catalogMean) / (n + M) -- shrinks a program's own average
 * toward the catalog mean, more so the fewer responses it has. n = 0 makes weighted
 * collapse to exactly catalogMean, which is what makes delta (and therefore the
 * multiplier) exactly zero/1 below -- not an approximation.
 *
 * The catalog mean sits well above the scale's midpoint in practice (recommend answers
 * skew positive), so a single symmetric divisor would make the +10% side nearly
 * unreachable while leaving -10% fully reachable. Normalizing each side by its own
 * distance to the scale's endpoint (5 or 1) gives both directions the full band.
 */
export function pollMultiplier(stats: PollRankStats, programId: string): number {
  const { catalogMean } = stats;
  if (catalogMean === null) return 1;
  const entry = stats.statsByProgramId[programId];
  const n = entry?.n ?? 0;
  // Explicit early return, not just n=0 falling through the arithmetic below with a
  // zeroed first term -- (n*avg + M*catalogMean)/(n+M) is mathematically catalogMean
  // when n=0, but floating-point addition/division isn't associative, so relying on
  // that identity holding bit-for-bit would make "n=0 is neutral" true by luck rather
  // than by construction. This guarantees the literal 1 the spec requires.
  if (n === 0) return 1;
  const weighted = (n * entry!.mean + POLL_SHRINKAGE_M * catalogMean) / (n + POLL_SHRINKAGE_M);
  const delta = weighted - catalogMean;
  if (delta === 0) return 1;
  const span = delta > 0 ? 5 - catalogMean : catalogMean - 1;
  if (span <= 0) return 1; // catalogMean already at the scale's endpoint -- no room to move
  const raw = 1 + MAX_POLL_ADJUSTMENT * (delta / span);
  return Math.min(1 + MAX_POLL_ADJUSTMENT, Math.max(1 - MAX_POLL_ADJUSTMENT, raw));
}

/** Binds `stats` into the plain (programId) => number shape rankPrograms's optional 4th
 * argument expects. `stats === null` (kill switch on, or no recommend question/answers
 * resolved yet) always returns exactly 1 -- same neutral result as n = 0. */
export function makePollModifier(stats: PollRankStats | null): (programId: string) => number {
  if (stats === null) return () => 1;
  return (programId: string) => pollMultiplier(stats, programId);
}
