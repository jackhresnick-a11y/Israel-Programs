import { prisma } from "@/lib/prisma";
import { POLL_FLAGS, type PollFlag } from "@/lib/pollShared";
import type { PollCompletion, PollResponseStatus } from "@/app/generated/prisma/enums";

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

/** The signed-in user's current counted rating for this program, if any -- used to
 * pre-fill RateForm ("Update your rating") for the update-in-place flow (locked
 * decision: a repeat signed-in visitor edits their existing response rather than being
 * rejected or creating a second row). */
export async function getExistingSignedInResponse(programId: string, userId: string) {
  return prisma.pollResponse.findFirst({
    where: { programId, userId, status: "COUNTED" },
    include: { answers: true },
  });
}

type SignedInSubmitInput = {
  programId: string;
  userId: string;
  answers: { questionId: string; value: number }[];
  naQuestionIds: string[];
  reviews: ReviewInput[];
  presentedQuestionIds: string[];
  ipHash: string;
};

async function attemptSignedInSubmit(input: SignedInSubmitInput) {
  const allQuestionIds = [...new Set([...input.answers.map((a) => a.questionId), ...input.reviews.map((r) => r.questionId)])];
  const questions = await prisma.pollQuestion.findMany({
    where: { id: { in: allQuestionIds } },
    select: { id: true, version: true },
  });
  const versionById = new Map(questions.map((q) => [q.id, q.version]));

  const response = await prisma.$transaction(async (tx) => {
    const existing = await tx.pollResponse.findFirst({
      where: { programId: input.programId, userId: input.userId, status: "COUNTED" },
    });

    const response = existing
      ? await tx.pollResponse.update({
          where: { id: existing.id },
          data: {
            ipHash: input.ipHash,
            presentedQuestionIds: input.presentedQuestionIds,
            naQuestionIds: input.naQuestionIds,
          },
        })
      : await tx.pollResponse.create({
          data: {
            programId: input.programId,
            userId: input.userId,
            verified: true,
            status: "COUNTED",
            ipHash: input.ipHash,
            presentedQuestionIds: input.presentedQuestionIds,
            naQuestionIds: input.naQuestionIds,
          },
        });

    if (existing) {
      await tx.pollAnswer.deleteMany({ where: { responseId: existing.id } });
    }

    // Skips are absence, not a row -- only questions the respondent actually answered
    // get a PollAnswer at all.
    if (input.answers.length > 0) {
      await tx.pollAnswer.createMany({
        data: input.answers.map((a) => ({
          responseId: response.id,
          questionId: a.questionId,
          questionVersion: versionById.get(a.questionId) ?? 1,
          value: a.value,
        })),
      });
    }

    return response;
  });

  const { skippedQuestionIds } = await insertReviews(response.id, input.programId, input.reviews, versionById);
  return { response, skippedReviewQuestionIds: skippedQuestionIds };
}

/**
 * Signed-in submission: verified + COUNTED immediately, no email step, ever. A repeat
 * visit updates the existing counted response in place (deletes and recreates its
 * answers in the same transaction) rather than creating a second row or rejecting the
 * resubmit -- the partial unique index on (userId, programId, status=COUNTED) is the
 * DB-level backstop against a concurrent double-submit race, which this function
 * retries once against (the retry's findFirst will see the row the losing race created
 * and update it instead of colliding again). Reviews insert after the answer
 * transaction commits (see insertReviews) so a duplicate review can never roll back an
 * otherwise-valid rating.
 */
export async function submitSignedInResponse(input: SignedInSubmitInput) {
  try {
    return await attemptSignedInSubmit(input);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return await attemptSignedInSubmit(input);
    }
    throw err;
  }
}

type AnonymousSubmitInput = {
  programId: string;
  referrerTokenId: string | null;
  tokenFlags: PollFlag[];
  answers: { questionId: string; value: number }[];
  naQuestionIds: string[];
  reviews: ReviewInput[];
  presentedQuestionIds: string[];
  yearAttended: number | null;
  completion: PollCompletion | null;
  ipHash: string;
  /** Optional, informational only -- never required, never gates counting (see
   * lib/pollShared.ts's anonymousSubmitSchema). */
  email: string | null;
  /** Whether the request already carried this program's `poll_v_<programId>` browser
   * cookie -- the route reads/sets this, this function only makes the counting decision
   * from it. See the POLL_FLAGS.REPEAT_BROWSER case below. */
  hasBrowserMarker: boolean;
};

/**
 * Anonymous link-path submission: counts immediately (`status: COUNTED`) unless a
 * submit-time anti-abuse check trips, in which case it lands `FLAGGED` instead --
 * replaces the old after-submit email-verification step, which caused too much
 * drop-off (real completions sat PENDING forever because the follow-up click never
 * happened). `verified` stays false either way -- it no longer gates counting, see the
 * PollResponse doc comment in schema.prisma. Three checks route to FLAGGED, each
 * additive (a response can carry several): the token's own flags (over cap, revoked,
 * expired -- lib/pollTokens.ts's validateReferrerToken), a prior non-voided response
 * from this same ipHash on this program (`REPEAT_IP`), and this browser already having
 * a counted response for this program per its `poll_v_<programId>` cookie
 * (`REPEAT_BROWSER`). A clean submission is the only way to land COUNTED. Reviews on a
 * FLAGGED response are stored (PENDING, same as any review) but stay unapprovable until
 * the parent is approved to COUNTED -- see lib/pollReviews.ts's approvePollReview.
 */
export async function submitAnonymousResponse(input: AnonymousSubmitInput) {
  const allQuestionIds = [...new Set([...input.answers.map((a) => a.questionId), ...input.reviews.map((r) => r.questionId)])];
  const questions = await prisma.pollQuestion.findMany({
    where: { id: { in: allQuestionIds } },
    select: { id: true, version: true },
  });
  const versionById = new Map(questions.map((q) => [q.id, q.version]));

  const priorFromSameIp = await prisma.pollResponse.count({
    where: { programId: input.programId, ipHash: input.ipHash, status: { not: "VOIDED" } },
  });
  const flags = [
    ...input.tokenFlags,
    ...(priorFromSameIp > 0 ? [POLL_FLAGS.REPEAT_IP] : []),
    ...(input.hasBrowserMarker ? [POLL_FLAGS.REPEAT_BROWSER] : []),
  ];
  const status: PollResponseStatus = flags.length > 0 ? "FLAGGED" : "COUNTED";

  const response = await prisma.pollResponse.create({
    data: {
      programId: input.programId,
      referrerTokenId: input.referrerTokenId,
      status,
      verified: false,
      email: input.email,
      yearAttended: input.yearAttended,
      completion: input.completion,
      ipHash: input.ipHash,
      flags,
      presentedQuestionIds: input.presentedQuestionIds,
      naQuestionIds: input.naQuestionIds,
    },
  });

  if (input.answers.length > 0) {
    await prisma.pollAnswer.createMany({
      data: input.answers.map((a) => ({
        responseId: response.id,
        questionId: a.questionId,
        questionVersion: versionById.get(a.questionId) ?? 1,
        value: a.value,
      })),
    });
  }

  const { skippedQuestionIds } = await insertReviews(response.id, input.programId, input.reviews, versionById);
  return { response, skippedReviewQuestionIds: skippedQuestionIds };
}

/**
 * Adds non-core "add more detail" answers, reviews, and N/A marks to a response, right
 * after the initial submit (the thank-you screen's expander). Restricted to non-VOIDED
 * responses -- the responseId is a bare cuid capability (no auth), so this must never
 * be able to mutate a response that's been voided. Anonymous responses are now COUNTED
 * (or FLAGGED) immediately on initial submit rather than sitting PENDING, so this no
 * longer needs a PENDING-only guard; appended answers are always non-core (extra
 * buckets only, never `overall` or any other core question), so they can never
 * retroactively change an already-locked score. `skipDuplicates` makes a
 * retried/double-submitted expander harmless rather than a 500 for answers (the
 * composite PollAnswer PK would otherwise reject it); reviews go through the same
 * per-row insertReviews as initial submission. `extraQuestionIds` is the full set of
 * non-core questions the expander displayed (from the route's resolved config, not the
 * client) -- appended onto `presentedQuestionIds` so moderation's skip diff reflects
 * everything actually shown, not just what was answered. `naQuestionIds` is
 * union-merged onto the response's existing marks (same posture as
 * `presentedQuestionIds`) rather than overwritten, since this call only ever adds to
 * a response's non-core detail, never replaces its initial-submit state.
 */
export async function addDetailAnswersAndReviews(
  responseId: string,
  answers: { questionId: string; value: number }[],
  reviews: ReviewInput[],
  extraQuestionIds: string[],
  naQuestionIds: string[] = []
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
  await prisma.pollResponse.update({
    where: { id: responseId },
    data: { presentedQuestionIds: nextPresented, naQuestionIds: nextNaQuestionIds },
  });

  const { skippedQuestionIds } = await insertReviews(responseId, response.programId, reviews, versionById);
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
 * reading as the same unexplained absence. */
export async function listPollResponses(filter: PollResponseFilter = {}) {
  const responses = await prisma.pollResponse.findMany({
    where: {
      ...(filter.programId ? { programId: filter.programId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
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
