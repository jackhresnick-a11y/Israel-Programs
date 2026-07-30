import { prisma } from "@/lib/prisma";
import { buildContactOptInFields, type ContactOptInInput } from "@/lib/contactOptIn";
import { upsertReferenceFromPoll } from "@/lib/references";
import { getQuestionsForProgram } from "@/lib/pollConfig";
import { getTokenFlagsById } from "@/lib/pollTokens";
import { hasReachedCoreMajority, decideAnonymousStatus } from "@/lib/pollUnlock";
import type { PollResponseStatus } from "@/app/generated/prisma/enums";

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && err.code === "P2002");
}

type ReviewInput = { questionId: string; text: string };

/**
 * Inserts reviews one at a time (not `createMany`) so a duplicate
 * (responseId, questionId) -- e.g. a signed-in resubmit re-sending a review for a
 * question already reviewed, or a retried "add more detail" call -- fails only that
 * one review instead of the whole batch. Every row starts PENDING; nothing here ever
 * sets APPROVED (see lib/pollReviews.ts's approvePollReview for the only write path
 * that can). Returns the question ids that were rejected as duplicates so the caller
 * can surface a friendly per-review message without failing the request.
 */
async function insertReviews(
  responseId: string,
  programId: string,
  reviews: ReviewInput[],
  versionById: Map<string, number>
): Promise<{ skippedQuestionIds: string[] }> {
  const skippedQuestionIds: string[] = [];
  const consentAt = new Date();
  for (const review of reviews) {
    try {
      await prisma.pollReview.create({
        data: {
          responseId,
          questionId: review.questionId,
          questionVersion: versionById.get(review.questionId) ?? 1,
          programId,
          text: review.text,
          consentGiven: true,
          consentAt,
        },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        skippedQuestionIds.push(review.questionId);
        continue;
      }
      throw err;
    }
  }
  return { skippedQuestionIds };
}

/** A signed-in respondent's current response for this program, if any -- COUNTED/
 * FLAGGED takes priority over a still-INCOMPLETE draft (defensive tiebreak; only one of
 * each should ever exist, since openSignedInResponse always reuses before creating).
 * Used both to pre-fill RateForm ("Update your rating" / resume a draft) and by
 * openSignedInResponse itself to avoid ever minting a second row for the same user. */
export async function getExistingSignedInResponse(programId: string, userId: string) {
  const real = await prisma.pollResponse.findFirst({
    where: { programId, userId, status: { in: ["COUNTED", "FLAGGED"] } },
    include: { answers: true },
  });
  if (real) return real;
  return prisma.pollResponse.findFirst({
    where: { programId, userId, status: "INCOMPLETE" },
    include: { answers: true },
  });
}

/**
 * Poll-open for a signed-in respondent: resumes an existing COUNTED/FLAGGED response
 * (the long-standing "update in place" precedent -- a repeat visitor edits their
 * existing rating rather than creating a second row) or a still-INCOMPLETE draft;
 * otherwise creates a fresh INCOMPLETE row. Never creates a second row for a user who
 * already has one in any of these statuses.
 */
export async function openSignedInResponse(input: {
  programId: string;
  userId: string;
  ipHash: string;
  presentedQuestionIds: string[];
}) {
  const existing = await getExistingSignedInResponse(input.programId, input.userId);
  if (existing) return existing;
  return prisma.pollResponse.create({
    data: {
      programId: input.programId,
      userId: input.userId,
      status: "INCOMPLETE",
      verified: false,
      ipHash: input.ipHash,
      presentedQuestionIds: input.presentedQuestionIds,
    },
    include: { answers: true },
  });
}

/**
 * Poll-open for an anonymous respondent: resumes the client-supplied `resumeId` if it's
 * a real, still-INCOMPLETE response belonging to this program -- the client sources this
 * from localStorage (the same mechanism the old form-value draft used, now storing just
 * an id) -- never trusted beyond that one check; anything else about the supplied id is
 * ignored in favor of minting a fresh response. There is still no identity to dedupe an
 * anonymous respondent by, so a mismatched/expired/missing resumeId always gets a
 * brand-new INCOMPLETE row -- the anti-abuse flags, evaluated later at the moment this
 * response would cross the majority bar, are still the only repeat-detection mechanism.
 */
export async function openAnonymousResponse(input: {
  programId: string;
  referrerTokenId: string;
  ipHash: string;
  presentedQuestionIds: string[];
  resumeId?: string;
}) {
  if (input.resumeId) {
    const existing = await prisma.pollResponse.findFirst({
      where: { id: input.resumeId, programId: input.programId, status: "INCOMPLETE" },
      include: { answers: true },
    });
    if (existing) return existing;
  }
  return prisma.pollResponse.create({
    data: {
      programId: input.programId,
      referrerTokenId: input.referrerTokenId,
      status: "INCOMPLETE",
      verified: false,
      ipHash: input.ipHash,
      presentedQuestionIds: input.presentedQuestionIds,
    },
    include: { answers: true },
  });
}

export type SaveAnswerResult = { status: PollResponseStatus };

/**
 * Debounced per-question autosave -- upserts (or clears, on `value: null`/`na: true`)
 * exactly one PollAnswer row keyed on the existing (responseId, questionId) primary key,
 * updates `naQuestionIds`, then checks for the majority-bar transition if the response
 * is still INCOMPLETE (a no-op call once it's already COUNTED/FLAGGED -- editing an
 * already-real response's answers afterward doesn't re-run anti-abuse checks). Refuses
 * to touch a VOIDED response, same guard `addDetailAnswersAndReviews` already used.
 * `hasBrowserMarker` is threaded in from the route (which reads/writes the cookie) --
 * this function only makes the counting decision from it, never touches cookies itself.
 */
export async function saveAnswer(input: {
  responseId: string;
  questionId: string;
  questionVersion: number;
  value: number | null;
  na: boolean;
  hasBrowserMarker: boolean;
}): Promise<SaveAnswerResult> {
  const response = await prisma.pollResponse.findUnique({
    where: { id: input.responseId },
    select: { status: true, programId: true, naQuestionIds: true },
  });
  if (!response || response.status === "VOIDED") {
    throw new Error("This response can no longer be edited");
  }

  if (input.na || input.value === null) {
    await prisma.pollAnswer.deleteMany({ where: { responseId: input.responseId, questionId: input.questionId } });
  } else {
    await prisma.pollAnswer.upsert({
      where: { responseId_questionId: { responseId: input.responseId, questionId: input.questionId } },
      create: {
        responseId: input.responseId,
        questionId: input.questionId,
        questionVersion: input.questionVersion,
        value: input.value,
      },
      update: { value: input.value, questionVersion: input.questionVersion },
    });
  }

  const naSet = new Set(response.naQuestionIds);
  if (input.na) naSet.add(input.questionId);
  else naSet.delete(input.questionId);
  await prisma.pollResponse.update({
    where: { id: input.responseId },
    data: { naQuestionIds: [...naSet] },
  });

  if (response.status !== "INCOMPLETE") {
    return { status: response.status };
  }
  return maybeTransition(input.responseId, response.programId, input.hasBrowserMarker);
}

/**
 * Checks whether an INCOMPLETE response has crossed the majority-of-Core bar and, if so,
 * transitions it to COUNTED/FLAGGED exactly once. The `updateMany` with `status:
 * "INCOMPLETE"` in its own where-clause is the concurrency guard: if two answer-saves
 * for the same response race each other past the majority check, only the first
 * `updateMany` actually matches a row (count: 1); the loser's `count: 0` short-circuits
 * to re-reading whatever status won, so the transition (and its anti-abuse side effects
 * below) can never run twice for the same response.
 *
 * Runs the *exact* anti-abuse decision the old one-shot submit used to run at
 * final-submit time -- see lib/pollUnlock.ts's decideAnonymousStatus -- just moved to
 * this crossing moment instead. Token flags are recomputed fresh here (see
 * lib/pollTokens.ts's getTokenFlagsById), never carried over from poll-open, since a
 * token could be revoked or go over cap in the time between opening and finishing a
 * poll. On a clean anonymous COUNTED transition, attempts the 18+-gated contact-email ->
 * pending Reference exactly once, using whatever referenceEmail/ageAttested were already
 * autosaved via the details endpoint -- same best-effort try/catch as the old flow, so a
 * reference-write failure only logs, never fails the transition.
 */
async function maybeTransition(
  responseId: string,
  programId: string,
  hasBrowserMarker: boolean
): Promise<SaveAnswerResult> {
  const [resolved, response, answers] = await Promise.all([
    getQuestionsForProgram(programId),
    prisma.pollResponse.findUnique({
      where: { id: responseId },
      select: {
        status: true,
        userId: true,
        referrerTokenId: true,
        ipHash: true,
        naQuestionIds: true,
        referenceEmail: true,
        ageAttested: true,
        yearAttended: true,
      },
    }),
    prisma.pollAnswer.findMany({ where: { responseId }, select: { questionId: true } }),
  ]);
  if (!response || response.status !== "INCOMPLETE") {
    return { status: response?.status ?? "INCOMPLETE" };
  }

  const coreIds = resolved.core.map((q) => q.id);
  const answeredIds = new Set(answers.map((a) => a.questionId));
  const naIds = new Set(response.naQuestionIds);
  if (!hasReachedCoreMajority(coreIds, answeredIds, naIds)) {
    return { status: "INCOMPLETE" };
  }

  if (response.userId) {
    // Signed-in: straight to COUNTED, no anti-abuse recompute -- same as the old
    // one-shot signed-in submit.
    const { count } = await prisma.pollResponse.updateMany({
      where: { id: responseId, status: "INCOMPLETE" },
      data: { status: "COUNTED", verified: true },
    });
    if (count === 0) {
      const fresh = await prisma.pollResponse.findUnique({ where: { id: responseId }, select: { status: true } });
      return { status: fresh?.status ?? "COUNTED" };
    }
    return { status: "COUNTED" };
  }

  const tokenFlags = response.referrerTokenId ? await getTokenFlagsById(response.referrerTokenId) : [];
  const { status, flags } = await decideAnonymousStatus({
    programId,
    ipHash: response.ipHash ?? "",
    tokenFlags,
    hasBrowserMarker,
  });

  const { count } = await prisma.pollResponse.updateMany({
    where: { id: responseId, status: "INCOMPLETE" },
    data: { status, flags },
  });
  if (count === 0) {
    const fresh = await prisma.pollResponse.findUnique({ where: { id: responseId }, select: { status: true } });
    return { status: fresh?.status ?? status };
  }

  // Best-effort: turn the 18+-gated contact email (already autosaved via the details
  // endpoint) into a PENDING alumni Reference. Wrapped so a failure can NEVER fail the
  // transition -- the response's new status is already persisted regardless. COUNTED
  // only: a FLAGGED transition never spawns a reference, even with a valid email and
  // 18+ attested.
  if (response.referenceEmail && status === "COUNTED") {
    try {
      await upsertReferenceFromPoll({
        programId,
        pollResponseId: responseId,
        email: response.referenceEmail,
        ageAttested: response.ageAttested,
        yearAttended: response.yearAttended,
      });
    } catch (err) {
      console.error("upsertReferenceFromPoll failed for poll response", responseId, err);
    }
  }

  return { status };
}

/**
 * Autosaves reviews, N/A marks, response-level contact fields (the anonymous path's
 * 18+-gated reference email, and the signed-in path's contact opt-in), and any answers
 * passed through it -- originally built for "add more detail" after an initial submit,
 * now doing double duty as the autosave endpoint for everything that isn't a star
 * rating (star ratings go through saveAnswer/the `/answer` route instead). Restricted to
 * non-VOIDED responses -- the responseId is a bare cuid capability (no auth), so this
 * must never be able to mutate a voided response. `skipDuplicates` makes a
 * retried/double-fired autosave harmless rather than a 500 (the composite PollAnswer PK
 * would otherwise reject it); reviews go through the same per-row insertReviews as
 * always. `presentedQuestionIds` is union-merged (never overwritten) so moderation's
 * skip diff keeps reflecting everything ever shown. If an N/A mark landed on a Core
 * question and the response is still INCOMPLETE, this can cross the majority bar just
 * like an answer would -- so the same transition check runs here too.
 */
export async function addDetailAnswersAndReviews(
  responseId: string,
  answers: { questionId: string; value: number }[],
  reviews: ReviewInput[],
  extraQuestionIds: string[],
  naQuestionIds: string[] = [],
  contactFields: {
    referenceEmail?: string;
    ageAttested?: boolean;
    contactOptIn?: ContactOptInInput | null;
  } = {},
  hasBrowserMarker = false
) {
  const response = await prisma.pollResponse.findUnique({
    where: { id: responseId },
    select: { status: true, programId: true, presentedQuestionIds: true, naQuestionIds: true },
  });
  if (!response || response.status === "VOIDED") {
    throw new Error("This response can no longer be edited");
  }

  const allQuestionIds = [...new Set([...answers.map((a) => a.questionId), ...reviews.map((r) => r.questionId)])];
  const questions = await prisma.pollQuestion.findMany({
    where: { id: { in: allQuestionIds } },
    select: { id: true, version: true },
  });
  const versionById = new Map(questions.map((q) => [q.id, q.version]));

  if (answers.length > 0) {
    await prisma.pollAnswer.createMany({
      data: answers.map((a) => ({
        responseId,
        questionId: a.questionId,
        questionVersion: versionById.get(a.questionId) ?? 1,
        value: a.value,
      })),
      skipDuplicates: true,
    });
  }

  const nextPresented = [...new Set([...response.presentedQuestionIds, ...extraQuestionIds])];
  const nextNaQuestionIds = [...new Set([...response.naQuestionIds, ...naQuestionIds])];
  const optInFields =
    contactFields.contactOptIn !== undefined ? buildContactOptInFields(contactFields.contactOptIn, new Date()) : {};
  await prisma.pollResponse.update({
    where: { id: responseId },
    data: {
      presentedQuestionIds: nextPresented,
      naQuestionIds: nextNaQuestionIds,
      ...(contactFields.referenceEmail !== undefined ? { referenceEmail: contactFields.referenceEmail } : {}),
      ...(contactFields.ageAttested !== undefined ? { ageAttested: contactFields.ageAttested } : {}),
      ...optInFields,
    },
  });

  const { skippedQuestionIds } = await insertReviews(responseId, response.programId, reviews, versionById);

  if (response.status === "INCOMPLETE") {
    await maybeTransition(responseId, response.programId, hasBrowserMarker);
  }

  return { skippedReviewQuestionIds: skippedQuestionIds };
}

export type PollResponseFilter = {
  programId?: string;
  status?: PollResponseStatus;
  verified?: boolean;
  referrerTokenId?: string;
  flaggedOnly?: boolean;
};

/** Admin moderation queue -- capped at 200 most-recent matches per filter combination.
 * Includes email/ipHash/answers/reviews, unlike every public/read-side query in this
 * codebase, because this is admin-only content behind /admin/polls/moderation's role
 * gate, same "sensitive fields are fine once past the admin gate" precedent as
 * /admin/references showing Reference.contactEmail. Each response also gets two
 * computed, disjoint lists resolved to {id, key, text} in one batched query across the
 * whole page rather than N+1 per response: `naQuestions` (ids in `naQuestionIds`,
 * questions the respondent explicitly opted out of) and `skippedQuestions`
 * (`presentedQuestionIds` minus whatever has a PollAnswer row minus whatever is in
 * `naQuestions`, i.e. left untouched with no explicit mark either way) -- so
 * moderation can show "N/A" and "Skipped" as distinct, explicit states instead of both
 * reading as the same unexplained absence.
 *
 * Excludes INCOMPLETE by default (an abandoned draft doesn't need a moderator's
 * attention) unless explicitly requested via `filter.status === "INCOMPLETE"` -- kept
 * reachable for support/debugging ("why didn't my response count") without cluttering
 * the default queue view. */
export async function listPollResponses(filter: PollResponseFilter = {}) {
  const responses = await prisma.pollResponse.findMany({
    where: {
      ...(filter.programId ? { programId: filter.programId } : {}),
      ...(filter.status ? { status: filter.status } : { status: { not: "INCOMPLETE" } }),
      ...(filter.verified !== undefined ? { verified: filter.verified } : {}),
      ...(filter.referrerTokenId ? { referrerTokenId: filter.referrerTokenId } : {}),
      ...(filter.flaggedOnly ? { flags: { isEmpty: false } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      program: { select: { name: true, slug: true } },
      referrerToken: { select: { label: true } },
      answers: { include: { question: { select: { key: true, text: true } } } },
      reviews: { include: { question: { select: { key: true, text: true } } } },
    },
  });

  const relevantIds = new Set<string>();
  for (const r of responses) {
    const answeredIds = new Set(r.answers.map((a) => a.questionId));
    const naIds = new Set(r.naQuestionIds);
    for (const qid of r.presentedQuestionIds) {
      if (!answeredIds.has(qid)) relevantIds.add(qid);
    }
    for (const qid of naIds) relevantIds.add(qid);
  }
  const questionRows =
    relevantIds.size > 0
      ? await prisma.pollQuestion.findMany({ where: { id: { in: [...relevantIds] } }, select: { id: true, key: true, text: true } })
      : [];
  const questionById = new Map(questionRows.map((q) => [q.id, q]));

  return responses.map((r) => {
    const answeredIds = new Set(r.answers.map((a) => a.questionId));
    const naIds = new Set(r.naQuestionIds);
    const naQuestions = r.naQuestionIds
      .map((qid) => questionById.get(qid))
      .filter((q): q is { id: string; key: string; text: string } => q !== undefined);
    const skippedQuestions = r.presentedQuestionIds
      .filter((qid) => !answeredIds.has(qid) && !naIds.has(qid))
      .map((qid) => questionById.get(qid))
      .filter((q): q is { id: string; key: string; text: string } => q !== undefined);
    return { ...r, naQuestions, skippedQuestions };
  });
}

/** Voids a response -- retained, never deleted, per the build spec. No status-specific
 * guard: a PENDING spam submission and a COUNTED one an admin later decides is bad
 * faith both just need to stop counting/cluttering the queue. */
export async function voidPollResponse(id: string) {
  return prisma.pollResponse.update({ where: { id }, data: { status: "VOIDED" } });
}

export type RestoreResult = { ok: true } | { ok: false; reason: "conflict" };

/**
 * Restores a voided response -- always back to COUNTED, since an admin's explicit
 * "restore" click *is* the approval (there's no separate prior-status to recompute
 * anymore now that anonymous responses count immediately on submit rather than sitting
 * PENDING/unverified). Can still collide with the signed-in partial unique index (e.g.
 * that user has since submitted a fresh counted response for this program) -- reported
 * as a conflict rather than thrown, since that's an expected, recoverable outcome for
 * an admin to see and decide on.
 */
export async function restorePollResponse(id: string): Promise<RestoreResult> {
  try {
    await prisma.pollResponse.update({ where: { id }, data: { status: "COUNTED" } });
    return { ok: true };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { ok: false, reason: "conflict" };
    }
    throw err;
  }
}

export type ApproveResult = { ok: true } | { ok: false; reason: string };

/**
 * The moderation queue's "Approve / count" action for a FLAGGED (or legacy PENDING)
 * response -- an admin looked at whatever tripped the anti-abuse check (repeat
 * ip/browser, token over cap/revoked/expired) and decided it's legitimate. Guarded to
 * FLAGGED/PENDING only, same "don't let an already-COUNTED or VOIDED response be
 * re-approved" posture as restorePollResponse's index-conflict handling below, which
 * this mirrors for the same reason: a signed-in response can't collide here (it's
 * never FLAGGED/PENDING to begin with), but the partial unique index is still the
 * DB-level backstop.
 */
export async function approvePollResponse(id: string): Promise<ApproveResult> {
  const response = await prisma.pollResponse.findUnique({ where: { id }, select: { status: true } });
  if (!response) return { ok: false, reason: "Response not found" };
  if (response.status !== "FLAGGED" && response.status !== "PENDING") {
    return { ok: false, reason: "This response isn't flagged or pending" };
  }

  try {
    await prisma.pollResponse.update({ where: { id }, data: { status: "COUNTED" } });
    return { ok: true };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { ok: false, reason: "conflict" };
    }
    throw err;
  }
}
