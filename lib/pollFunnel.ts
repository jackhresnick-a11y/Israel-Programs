import { prisma } from "@/lib/prisma";
import { POLL_ANALYTICS_EVENTS } from "@/lib/pollAnalytics";

/**
 * Aggregation over the poll funnel events lib/pollAnalytics.ts writes to AnalyticsEvent.
 * $queryRaw throughout, not the Prisma client's query builder -- Prisma can't `GROUP BY`
 * a JSON sub-field (payload->>'programId'/'responseId'), the same reason
 * lib/analytics.ts's getAnalyticsSummary does its own aggregation in JS/raw SQL rather
 * than Prisma's groupBy. The JSONB expression index this feature's migration adds
 * (AnalyticsEvent_type_payload_programId_idx) is what keeps the per-program grouping
 * cheap. `COUNT(DISTINCT payload->>'responseId')` throughout, not a raw row count --
 * a resumed poll-open or a retried autosave can fire more than one event row for the
 * same response, and the funnel should count respondents, not events.
 */

type ProgramCountRow = { programId: string; count: bigint };

async function countDistinctResponsesByProgram(type: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<ProgramCountRow[]>`
    SELECT payload ->> 'programId' as "programId", COUNT(DISTINCT payload ->> 'responseId') as count
    FROM "AnalyticsEvent"
    WHERE type = ${type}
    GROUP BY payload ->> 'programId'
  `;
  return new Map(rows.map((r) => [r.programId, Number(r.count)]));
}

export type ProgramFunnelRow = {
  programId: string;
  programName: string;
  programSlug: string;
  opens: number;
  counted: number;
  fullyCompleted: number;
  /** fullyCompleted / opens -- the strict "did they actually finish" signal, distinct
   * from `counted` (which only needs the lighter readiness bar in lib/pollUnlock.ts).
   * Null when there are zero opens (nothing to divide by). */
  completionRate: number | null;
};

export type DropOffBucket = { position: number; stoppedCount: number };

export type FunnelSummary = {
  totalOpens: number;
  totalCounted: number;
  totalFullyCompleted: number;
  completionRate: number | null;
  programs: ProgramFunnelRow[];
  /** Every question-answered event from a response that never reached
   * poll_fully_completed, bucketed by the highest question position it reached --
   * "the question position ... at which people most commonly stop." Position is
   * recomputed live at each answer-save against the program's resolved order at that
   * moment, so a question reordered/removed since a given event won't retroactively
   * shift historical positions -- this is a directional signal, not an exact replay.
   * Sorted by stoppedCount descending so the biggest drop-off points sort first.
   */
  dropOffByPosition: DropOffBucket[];
};

type MaxPositionRow = { responseId: string; maxPosition: number };

/** Every response's furthest-reached question position, from poll_question_answered
 * events only -- a response that never answered anything (opened and abandoned
 * immediately) contributes no row here and is invisible to the histogram, same as it
 * would be to any "where did they stop answering" question. */
async function getMaxPositionByResponse(programId?: string): Promise<MaxPositionRow[]> {
  if (programId) {
    return prisma.$queryRaw<MaxPositionRow[]>`
      SELECT payload ->> 'responseId' as "responseId", MAX((payload ->> 'position')::int) as "maxPosition"
      FROM "AnalyticsEvent"
      WHERE type = ${POLL_ANALYTICS_EVENTS.QUESTION_ANSWERED} AND payload ->> 'programId' = ${programId}
      GROUP BY payload ->> 'responseId'
    `;
  }
  return prisma.$queryRaw<MaxPositionRow[]>`
    SELECT payload ->> 'responseId' as "responseId", MAX((payload ->> 'position')::int) as "maxPosition"
    FROM "AnalyticsEvent"
    WHERE type = ${POLL_ANALYTICS_EVENTS.QUESTION_ANSWERED}
    GROUP BY payload ->> 'responseId'
  `;
}

async function getFullyCompletedResponseIds(programId?: string): Promise<Set<string>> {
  const rows = programId
    ? await prisma.$queryRaw<{ responseId: string }[]>`
        SELECT DISTINCT payload ->> 'responseId' as "responseId"
        FROM "AnalyticsEvent"
        WHERE type = ${POLL_ANALYTICS_EVENTS.FULLY_COMPLETED} AND payload ->> 'programId' = ${programId}
      `
    : await prisma.$queryRaw<{ responseId: string }[]>`
        SELECT DISTINCT payload ->> 'responseId' as "responseId"
        FROM "AnalyticsEvent"
        WHERE type = ${POLL_ANALYTICS_EVENTS.FULLY_COMPLETED}
      `;
  return new Set(rows.map((r) => r.responseId));
}

async function getDropOffByPosition(programId?: string): Promise<DropOffBucket[]> {
  const [maxPositions, fullyCompleted] = await Promise.all([
    getMaxPositionByResponse(programId),
    getFullyCompletedResponseIds(programId),
  ]);
  const counts = new Map<number, number>();
  for (const row of maxPositions) {
    if (fullyCompleted.has(row.responseId)) continue;
    counts.set(row.maxPosition, (counts.get(row.maxPosition) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([position, stoppedCount]) => ({ position, stoppedCount }))
    .sort((a, b) => b.stoppedCount - a.stoppedCount || a.position - b.position);
}

/** Every published program's funnel numbers, plus the sitewide aggregate and drop-off
 * histogram, for /admin/polls/funnel. Bounded by the published-program count (tens, not
 * thousands) on an admin-only page, same acceptable-cost posture as
 * lib/pollResults.ts's listRatingCoverage. */
export async function getFunnelSummary(): Promise<FunnelSummary> {
  const [opensByProgram, countedByProgram, fullyCompletedByProgram, dropOffByPosition, programs] = await Promise.all([
    countDistinctResponsesByProgram(POLL_ANALYTICS_EVENTS.OPENED),
    countDistinctResponsesByProgram(POLL_ANALYTICS_EVENTS.COUNTED),
    countDistinctResponsesByProgram(POLL_ANALYTICS_EVENTS.FULLY_COMPLETED),
    getDropOffByPosition(),
    prisma.program.findMany({ where: { status: "PUBLISHED" }, select: { id: true, name: true, slug: true } }),
  ]);

  const programRows: ProgramFunnelRow[] = programs
    .map((p) => {
      const opens = opensByProgram.get(p.id) ?? 0;
      const counted = countedByProgram.get(p.id) ?? 0;
      const fullyCompleted = fullyCompletedByProgram.get(p.id) ?? 0;
      return {
        programId: p.id,
        programName: p.name,
        programSlug: p.slug,
        opens,
        counted,
        fullyCompleted,
        completionRate: opens > 0 ? fullyCompleted / opens : null,
      };
    })
    .filter((row) => row.opens > 0) // programs with zero poll traffic just clutter the list
    .sort((a, b) => b.opens - a.opens || a.programName.localeCompare(b.programName));

  const totalOpens = programRows.reduce((sum, r) => sum + r.opens, 0);
  const totalCounted = programRows.reduce((sum, r) => sum + r.counted, 0);
  const totalFullyCompleted = programRows.reduce((sum, r) => sum + r.fullyCompleted, 0);

  return {
    totalOpens,
    totalCounted,
    totalFullyCompleted,
    completionRate: totalOpens > 0 ? totalFullyCompleted / totalOpens : null,
    programs: programRows,
    dropOffByPosition,
  };
}
