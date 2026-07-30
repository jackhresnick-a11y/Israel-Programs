import { prisma } from "@/lib/prisma";
import { POLL_FLAGS, type PollFlag } from "@/lib/pollShared";
import type { PollResponseStatus } from "@/app/generated/prisma/enums";

/** Majority of a live Core-bucket question count, computed fresh every time -- never
 * cached, never hardcoded. An admin adding/removing a Core question is picked up on the
 * very next answer save for any in-progress response, because the caller always derives
 * `coreCount` from `getQuestionsForProgram(programId).core.length` (see
 * lib/pollConfig.ts), not from anything stored. */
export function computeMajority(coreCount: number): number {
  return Math.floor(coreCount / 2) + 1;
}

/** Whether a response has answered-or-N/A'd enough Core questions to cross the "unlock"
 * bar. N/A counts the same as an answer here -- it's a deliberate, positive signal
 * ("doesn't apply to me"), not silence, same distinction the rest of this codebase
 * already draws between N/A and a truly untouched question. A program with zero
 * resolvable Core questions can never be crossed (there's nothing to answer). */
export function hasReachedCoreMajority(
  coreQuestionIds: string[],
  answeredIds: ReadonlySet<string>,
  naIds: ReadonlySet<string>
): boolean {
  if (coreQuestionIds.length === 0) return false;
  const majority = computeMajority(coreQuestionIds.length);
  let count = 0;
  for (const id of coreQuestionIds) {
    if (answeredIds.has(id) || naIds.has(id)) count++;
  }
  return count >= majority;
}

/** A Core question's id/creation time/current status -- the minimal shape
 * resolveHistoricalCoreQuestionIds needs, independent of where the caller sourced it
 * from (a live Prisma query, a test fixture, etc). */
export type HistoricalCoreQuestion = { id: string; createdAt: Date; status: "ACTIVE" | "RETIRED" };

/**
 * The Core-bucket questions that were live at the moment a SPECIFIC response was
 * created -- the historical denominator for that one response's majority check, as
 * opposed to `hasReachedCoreMajority`'s live/current-moment usage during autosave.
 * Excludes any question created after the response (so a later-added Core question can
 * never retroactively enlarge -- and thus never shrink a response's chance of meeting --
 * an older response's majority bar: this is what makes "adding a General question must
 * never reduce a program's existing count" hold automatically, with no special-casing)
 * and any question that's currently RETIRED (retired questions never count toward any
 * current-day computation, regardless of when they existed -- same posture as their
 * exclusion from the live rating form, just applied here to a historical readiness
 * count instead of what's served to a new respondent).
 */
export function resolveHistoricalCoreQuestionIds(
  coreQuestions: HistoricalCoreQuestion[],
  responseCreatedAt: Date
): string[] {
  return coreQuestions.filter((q) => q.status === "ACTIVE" && q.createdAt <= responseCreatedAt).map((q) => q.id);
}

/** Whether one response meets the historical majority-of-Core bar -- i.e. whether it
 * represents genuine engagement for coverage/readiness purposes, judged against the
 * Core question set as it existed when THAT response was created, not today's set. */
export function responseMeetsHistoricalMajority(
  coreQuestions: HistoricalCoreQuestion[],
  responseCreatedAt: Date,
  answeredIds: ReadonlySet<string>,
  naIds: ReadonlySet<string>
): boolean {
  const historicalIds = resolveHistoricalCoreQuestionIds(coreQuestions, responseCreatedAt);
  return hasReachedCoreMajority(historicalIds, answeredIds, naIds);
}

/**
 * The anonymous-path status decision, extracted from the old one-shot submit flow so it
 * can run once, at the moment a response crosses the majority bar, instead of at a
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
