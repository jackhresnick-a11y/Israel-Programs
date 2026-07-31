import { prisma } from "@/lib/prisma";
import { POLL_FLAGS, type PollFlag } from "@/lib/pollShared";
import type { PollResponseStatus } from "@/app/generated/prisma/enums";

/**
 * The "readiness" bar a response must cross to leave INCOMPLETE and become
 * COUNTED/FLAGGED: at least one answered-or-N/A question from EVERY bucket actually
 * served to this respondent, with a floor of 3 answered-or-N/A questions total. This
 * replaced a majority-of-General-only rule (`computeMajority`/`hasReachedCoreMajority`,
 * removed) that rewarded depth over spread -- a response that exhausted General and
 * quit counted, while one touching every bucket once did not. Spread is the more useful
 * signal for what actually gets published (see components/PollSummaryStrip.tsx's
 * per-question 7-response bar, which this doesn't change at all).
 *
 * `groups` is one entry per bucket served to this respondent -- always
 * `[coreIds, ...extraBucketIds]`, computed fresh from `getQuestionsForProgram` every
 * time, never cached or hardcoded, same posture the old majority check had. An empty
 * group (a bucket resolved to zero questions, e.g. every question in it was removed for
 * this program) is ignored rather than treated as an impossible-to-satisfy requirement.
 * A response with zero non-empty groups can never cross, matching the old zero-Core
 * behavior. N/A counts the same as an answer -- a deliberate "doesn't apply to me"
 * signal, not silence, same distinction the rest of this codebase already draws.
 */
export function hasReachedBucketSpread(
  groups: string[][],
  answeredIds: ReadonlySet<string>,
  naIds: ReadonlySet<string>
): boolean {
  const servedGroups = groups.filter((g) => g.length > 0);
  if (servedGroups.length === 0) return false;

  const answeredOrNa = (id: string) => answeredIds.has(id) || naIds.has(id);
  if (!servedGroups.every((group) => group.some(answeredOrNa))) return false;

  const allServedIds = new Set(servedGroups.flat());
  let total = 0;
  for (const id of allServedIds) {
    if (answeredOrNa(id)) total++;
  }
  return total >= 3;
}

/**
 * A Core/extra question's id plus its current status -- the minimal shape
 * `hasReachedReadinessBar`'s historical variant needs to exclude a since-retired
 * question from a past response's readiness computation, independent of where the
 * caller sourced it from (a live Prisma query, a test fixture, etc). Unlike the old
 * `HistoricalCoreQuestion`, `createdAt` is deliberately NOT part of this shape --
 * `presentedQuestionIds` (see below) is what pins a response to the question set it was
 * actually shown, not a question's creation timestamp.
 */
export type HistoricalQuestion = { id: string; status: "ACTIVE" | "RETIRED" };

/**
 * The historical counterpart to `hasReachedBucketSpread`, for judging an EXISTING
 * response against the bucket groups it was actually served -- as opposed to a live,
 * in-progress response, which is always checked against the program's Core/extras as
 * they resolve right now (see `maybeTransition` in lib/pollResponses.ts).
 *
 * `presentedQuestionIds` (snapshotted server-side at poll-open, union-merged -- never
 * overwritten -- on later saves; see lib/pollResponses.ts) is the historical record of
 * which questions this specific response was shown, which is a more accurate source
 * than re-deriving from question `createdAt`: two responses opened on the same day
 * against the same program config were always served the identical set, regardless of
 * exactly when each underlying question row was created. `bucketGroups` are today's
 * buckets, each filtered down to {questions in presentedQuestionIds} ∩ {still ACTIVE} --
 * a bucket that's been entirely retired since, or whose every presented question has
 * been retired, drops out as an empty group (ignored, same as a live empty group).
 */
export function resolveHistoricalBucketGroups(
  bucketGroups: string[][],
  presentedQuestionIds: readonly string[],
  questionsById: ReadonlyMap<string, HistoricalQuestion>
): string[][] {
  const presented = new Set(presentedQuestionIds);
  return bucketGroups.map((group) =>
    group.filter((id) => presented.has(id) && questionsById.get(id)?.status === "ACTIVE")
  );
}

/** Whether one existing response meets the historical spread bar -- i.e. whether it
 * represents genuine engagement for coverage/readiness purposes, judged against the
 * bucket groups it was actually presented, not today's live resolution for a new
 * respondent. */
export function responseMeetsHistoricalSpread(
  bucketGroups: string[][],
  presentedQuestionIds: readonly string[],
  questionsById: ReadonlyMap<string, HistoricalQuestion>,
  answeredIds: ReadonlySet<string>,
  naIds: ReadonlySet<string>
): boolean {
  const historicalGroups = resolveHistoricalBucketGroups(bucketGroups, presentedQuestionIds, questionsById);
  return hasReachedBucketSpread(historicalGroups, answeredIds, naIds);
}

/**
 * The anonymous-path status decision, extracted from the old one-shot submit flow so it
 * can run once, at the moment a response crosses the readiness bar, instead of at a
 * single final "submit" click. Both counts are scoped to `COUNTED`/`FLAGGED` only --
 * never `INCOMPLETE` or `VOIDED` -- so an abandoned draft (which never crosses the bar
 * and stays INCOMPLETE forever) can never cap out or flag its own later, real attempt.
 * See lib/pollTokens.ts's validateReferrerToken for the matching token-cap fix.
 */
export async function decideAnonymousStatus(input: {
  programId: string;
  ipHash: string;
  tokenFlags: PollFlag[];
  hasBrowserMarker: boolean;
}): Promise<{ status: PollResponseStatus; flags: PollFlag[] }> {
  const priorFromSameIp = await prisma.pollResponse.count({
    where: { programId: input.programId, ipHash: input.ipHash, status: { in: ["COUNTED", "FLAGGED"] } },
  });
  const flags: PollFlag[] = [
    ...input.tokenFlags,
    ...(priorFromSameIp > 0 ? [POLL_FLAGS.REPEAT_IP] : []),
    ...(input.hasBrowserMarker ? [POLL_FLAGS.REPEAT_BROWSER] : []),
  ];
  const status: PollResponseStatus = flags.length > 0 ? "FLAGGED" : "COUNTED";
  return { status, flags };
}
