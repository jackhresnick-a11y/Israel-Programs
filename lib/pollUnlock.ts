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
