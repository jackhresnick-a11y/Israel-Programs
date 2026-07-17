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

/**
 * Which of the four program-page summary states applies. `countedVerified` is not
 * simply "how many responses are COUNTED+verified" -- since questions became skippable,
 * a response can be COUNTED+verified but have skipped `overall` entirely. The publish
 * gate (and the headline/progress-bar counts derived from it) reads the number of
 * COUNTED+verified responses that actually *answered* `overall` -- see
 * lib/pollResults.ts's getProgramPollSummary, which computes this as an answer count,
 * not a response count, before calling this function.
 */
export function summaryState(
  countedVerified: number,
  minResponsesToPublish: number,
  resultsVisible: boolean,
  killSwitchOn: boolean
): PollSummaryState {
  if (countedVerified === 0) return "be_first";
  if (countedVerified < minResponsesToPublish) return "collecting";
  if (killSwitchOn || !resultsVisible) return "under_review";
  return "published";
}
