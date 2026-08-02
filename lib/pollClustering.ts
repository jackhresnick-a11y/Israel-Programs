/**
 * Advisory-only signal for the admin rating-coverage view (/admin/polls/coverage): does a
 * below-threshold program's response set look like it came predominantly from one
 * WhatsApp-group blast (a time burst) or one cohort year, rather than organic arrivals
 * spread over time? This is informational only -- it exists to help a human decide
 * whether to look closer at a program, nothing more.
 *
 * Contract: this module must never be imported by, or referenced from, any write,
 * status-transition, or visibility-gating path (lib/pollUnlock.ts, lib/pollResponses.ts,
 * lib/pollResults.ts's getProgramPollSummary). It has exactly one real caller --
 * lib/pollResults.ts's listRatingCoverage -- and must stay that way. A clustered signal
 * never blocks, delays, or holds back a program's unlock.
 *
 * Pure, no Prisma import, so it's testable without a DB and safely importable from a
 * client component if ever needed.
 */

export const CLUSTER_MIN_RESPONSES = 4;
export const CLUSTER_DOMINANCE_SHARE = 0.7;
export const CLUSTER_BURST_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CLUSTER_MIN_KNOWN_COHORT_SHARE = 0.5;

export type ClusterResponseInput = {
  createdAt: Date;
  /** null = "Prefer not to say" (the RateForm default) -- excluded from cohort
   *  calculations, not treated as its own cohort. 0 is the "Earlier" sentinel and IS a
   *  real cohort value (see yearAttendedOptions in this file's sibling lib/pollShared.ts). */
  yearAttended: number | null;
};

export type ClusterSignal = {
  /** True when most responses landed inside one CLUSTER_BURST_WINDOW_MS window --
   *  consistent with a single group-chat share cascading quickly, as opposed to organic
   *  arrivals spread over days or weeks. */
  burst: boolean;
  /** The largest number of responses found inside any CLUSTER_BURST_WINDOW_MS window. */
  maxInWindow: number;
  /** True when most responses with a known year share the same one. */
  cohort: boolean;
  dominantYear: number | null;
  dominantYearCount: number;
  /** Responses with a non-null yearAttended (0 counts as known). */
  knownYearCount: number;
  total: number;
};

/**
 * Largest number of timestamps found inside any window of `windowMs`, using a sorted
 * two-pointer sweep (O(n log n) total). The window is inclusive at both ends: two
 * timestamps exactly `windowMs` apart count as being in the same window together.
 */
export function maxResponsesInWindow(timestampsMs: readonly number[], windowMs: number): number {
  if (timestampsMs.length === 0) return 0;
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  let left = 0;
  let max = 0;
  for (let right = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > windowMs) left++;
    max = Math.max(max, right - left + 1);
  }
  return max;
}

/**
 * Computes the burst and cohort signals for one program's COUNTED responses. Both
 * signals require CLUSTER_MIN_RESPONSES total responses before they can ever fire --
 * a small opening handful of responses on any program looks "clustered" by definition
 * and flagging that would just be noise on every program's first days.
 */
export function computeClusterSignal(responses: readonly ClusterResponseInput[]): ClusterSignal {
  const total = responses.length;

  const maxInWindow = maxResponsesInWindow(
    responses.map((r) => r.createdAt.getTime()),
    CLUSTER_BURST_WINDOW_MS
  );
  const burst = total >= CLUSTER_MIN_RESPONSES && maxInWindow / total >= CLUSTER_DOMINANCE_SHARE;

  const known = responses.filter((r) => r.yearAttended !== null);
  const knownYearCount = known.length;
  const countsByYear = new Map<number, number>();
  for (const r of known) {
    const year = r.yearAttended as number;
    countsByYear.set(year, (countsByYear.get(year) ?? 0) + 1);
  }
  let dominantYear: number | null = null;
  let dominantYearCount = 0;
  for (const [year, count] of countsByYear) {
    if (count > dominantYearCount) {
      dominantYear = year;
      dominantYearCount = count;
    }
  }
  const cohort =
    total >= CLUSTER_MIN_RESPONSES &&
    knownYearCount >= CLUSTER_MIN_RESPONSES &&
    knownYearCount / total >= CLUSTER_MIN_KNOWN_COHORT_SHARE &&
    dominantYearCount / knownYearCount >= CLUSTER_DOMINANCE_SHARE;

  return { burst, maxInWindow, cohort, dominantYear, dominantYearCount, knownYearCount, total };
}

export function isClustered(signal: ClusterSignal): boolean {
  return signal.burst || signal.cohort;
}
