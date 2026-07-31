import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getQuestionsForProgram } from "@/lib/pollConfig";
import { flattenResolvedQuestionIds } from "@/lib/pollShared";
import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Poll funnel instrumentation, reusing the existing first-party AnalyticsEvent model
 * (same {type, payload, createdAt} shape lib/analytics.ts already writes to) rather
 * than a new table or any third-party tracker -- no personal data, no IP, no email, no
 * Clerk user id ever written here. `responseId` is the only identifier logged, and it's
 * an internal cuid already stored on the PollResponse row, not personal data; it's what
 * makes "where does one respondent's chain stop" answerable at all (see lib/pollFunnel.ts).
 *
 * `poll_page_completed` is defined here but not yet fired anywhere -- pagination
 * (poll restructure item 2) doesn't exist yet; the event type is reserved so the funnel
 * schema doesn't need a second migration once it ships.
 */
export const POLL_ANALYTICS_EVENTS = {
  OPENED: "poll_opened",
  QUESTION_ANSWERED: "poll_question_answered",
  PAGE_COMPLETED: "poll_page_completed",
  COUNTED: "poll_counted",
  FULLY_COMPLETED: "poll_fully_completed",
} as const;

export type PollAnalyticsEventType = (typeof POLL_ANALYTICS_EVENTS)[keyof typeof POLL_ANALYTICS_EVENTS];

/** Fire-and-forget writer, same shape as lib/analytics.ts's record(): runs after the
 * response has streamed (`after()`), and any failure is logged and swallowed -- a
 * funnel write must never block, slow, or fail a poll save. The outer try/catch (not
 * just the one inside the callback) matters: `after()` itself throws SYNCHRONOUSLY if
 * called outside a real Next.js request scope -- which happens whenever the pollUnlock/
 * pollResponses functions that call into this module are exercised directly by a test
 * (see lib/pollReferences.test.ts), not through an actual route handler. Swallowing
 * that here keeps this module test-safe without the tests needing to mock `next/server`. */
function record(type: PollAnalyticsEventType, payload: Prisma.InputJsonValue): void {
  try {
    after(async () => {
      try {
        await prisma.analyticsEvent.create({ data: { type, payload } });
      } catch (err) {
        console.error("[pollAnalytics] dropped", type, err);
      }
    });
  } catch (err) {
    console.error("[pollAnalytics] after() unavailable, dropped", type, err);
  }
}

export function trackPollOpened(programId: string, responseId: string): void {
  record(POLL_ANALYTICS_EVENTS.OPENED, { programId, responseId });
}

/** `position` is this question's index (0-based) in the program's live resolved
 * question order (core, then extras, the same order flattenResolvedQuestionIds and the
 * rating form itself use) -- the raw material for the admin funnel's drop-off
 * histogram: "the question position and page at which people most commonly stop." */
export function trackPollQuestionAnswered(input: {
  programId: string;
  responseId: string;
  questionId: string;
  position: number;
}): void {
  record(POLL_ANALYTICS_EVENTS.QUESTION_ANSWERED, input);
}

/** Fires exactly once per response, at the same `updateMany({ status: "INCOMPLETE" })`
 * concurrency-guarded moment lib/pollResponses.ts's maybeTransition performs the real
 * transition -- never at the race-loser branch, so this can't double-fire the way the
 * transition itself can't. Fires for both COUNTED and FLAGGED: both mean the readiness
 * bar (item 1) was met: a FLAGGED response is anti-abuse-held back from public
 * aggregates, but it still represents real engagement for funnel purposes. */
export function trackPollCounted(programId: string, responseId: string, status: string): void {
  record(POLL_ANALYTICS_EVENTS.COUNTED, { programId, responseId, status });
}

/**
 * Fires once, the moment a response has every question it was served answered-or-N/A --
 * idempotent via a $queryRaw existence check against AnalyticsEvent itself (the JSONB
 * expression index this migration adds is exactly what makes that check cheap), since an
 * already-complete response's later comment/detail edits would otherwise keep
 * re-matching "fully complete" on every subsequent autosave and inflate the metric.
 * Safe to call after every answer save unconditionally -- it's a no-op until the
 * response is actually, fully done, and it never throws into the caller (including if
 * `after()` itself is unavailable outside a request scope -- see record()'s doc comment).
 */
export function trackPollFullyCompletedIfNew(programId: string, responseId: string): void {
  try {
    after(async () => {
      try {
        const [response, resolved] = await Promise.all([
          prisma.pollResponse.findUnique({ where: { id: responseId }, select: { naQuestionIds: true } }),
          getQuestionsForProgram(programId),
        ]);
        if (!response) return;
        const allIds = flattenResolvedQuestionIds(resolved);
        if (allIds.length === 0) return;

        const answers = await prisma.pollAnswer.findMany({ where: { responseId }, select: { questionId: true } });
        const answeredOrNa = new Set([...answers.map((a) => a.questionId), ...response.naQuestionIds]);
        if (!allIds.every((id) => answeredOrNa.has(id))) return;

        const existing = await prisma.$queryRaw<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM "AnalyticsEvent"
            WHERE type = ${POLL_ANALYTICS_EVENTS.FULLY_COMPLETED}
              AND payload ->> 'responseId' = ${responseId}
          ) as exists
        `;
        if (existing[0]?.exists) return;

        await prisma.analyticsEvent.create({
          data: { type: POLL_ANALYTICS_EVENTS.FULLY_COMPLETED, payload: { programId, responseId } },
        });
      } catch (err) {
        console.error("[pollAnalytics] dropped poll_fully_completed check", err);
      }
    });
  } catch (err) {
    console.error("[pollAnalytics] after() unavailable, dropped poll_fully_completed check", err);
  }
}
