/**
 * Pure display math for the alumni-ratings system -- no Prisma import, safe for any
 * "use client" component. Percent and stars must always be arithmetically consistent
 * (per the build spec: "these are the same number in two formats"), so both are derived
 * from the single mean here rather than computed independently anywhere else.
 */
import type { PollSummaryState } from "@/lib/pollShared";

/** Percent = (mean / 5) * 100, rounded to the nearest integer. Never stored -- always a
 * rendering of the 1-5 mean at read time. */
export function meanToPercent(mean: number): number {
  return Math.round((mean / 5) * 100);
}

/** Stars rounded to 1 decimal place, as a display string. */
export function formatStarsMean(mean: number): string {
  return mean.toFixed(1);
}

/** Where a DESCRIPTIVE question's mean sits on its 1-5 low->high track, as a percent
 * (0 = value 1, 100 = value 5) for positioning the spectrum marker. Same one-decimal
 * `x.x` string as formatStarsMean backs the "x.x / 5" number shown alongside it --
 * deliberately not a separate format, so the two never drift apart. */
export function meanToSpectrumPercent(mean: number): number {
  return Math.max(0, Math.min(100, ((mean - 1) / 4) * 100));
}

/**
 * Which of the four program-page summary states applies. `counted` is not simply "how
 * many responses are COUNTED" -- since questions became skippable, a response can be
 * COUNTED but have skipped `overall` entirely. The publish gate (and the
 * headline/progress-bar counts derived from it) reads the number of COUNTED responses
 * that actually *answered* `overall` -- see lib/pollResults.ts's getProgramPollSummary,
 * which computes this as an answer count, not a response count, before calling this
 * function.
 */
export function summaryState(
  counted: number,
  minResponsesToPublish: number,
  resultsVisible: boolean,
  killSwitchOn: boolean
): PollSummaryState {
  if (counted === 0) return "be_first";
  if (counted < minResponsesToPublish) return "collecting";
  if (killSwitchOn || !resultsVisible) return "under_review";
  return "published";
}
