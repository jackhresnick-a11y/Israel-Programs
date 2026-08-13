import { prisma } from "@/lib/prisma";
import { getElaborationPromptsConfig, enabledPrompts } from "@/lib/pollElaborationPrompts";
import { POLL_ELABORATION_CONSENT_LABEL } from "@/lib/pollShared";
import type { PollReviewStatus } from "@/app/generated/prisma/enums";
import type { ReviewAttentionFlag } from "@/lib/pollReviews";
import { REVIEW_ATTENTION_FLAGS } from "@/lib/pollReviews";

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && err.code === "P2002");
}

/** True for a Prisma "table/column does not exist" error (P2021/P2022) -- the state this
 * repo's own migration-ordering trap produces (see CLAUDE.md's "migration ordering is
 * code-last" section) if this code ever runs before
 * 20260813000000_add_poll_elaboration_answers is applied. Every public/read path below
 * degrades to empty rather than 500ing so the rest of the poll and the program page stay
 * up; the elaboration feature itself is simply inert until the table exists. */
function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("code" in err)) return false;
  return err.code === "P2021" || err.code === "P2022";
}

export type CreateElaborationAnswerResult =
  | { ok: true; skipped: false }
  | { ok: true; skipped: true }
  | { ok: false; reason: string };

/**
 * Creates one elaboration answer for a response, gated purely on the prompt still being
 * live (enabled in the current SiteContent config) and the response not being VOIDED.
 * Deliberately writes NOTHING to PollResponse -- no status, no flags, no answers -- so
 * answering (or skipping) this block can never affect readiness/counting, matching the
 * per-question review autosave's posture. A duplicate (responseId, promptKey) -- e.g. a
 * retried request -- is reported as skipped, never a 500, same as insertReviews.
 */
export async function createElaborationAnswer(input: {
  responseId: string;
  promptKey: string;
  text: string;
}): Promise<CreateElaborationAnswerResult> {
  const response = await prisma.pollResponse.findUnique({
    where: { id: input.responseId },
    select: { status: true, programId: true },
  });
  if (!response) return { ok: false, reason: "Response not found" };
  if (response.status === "VOIDED") return { ok: false, reason: "This response can no longer be edited" };

  const config = await getElaborationPromptsConfig();
  const prompt = enabledPrompts(config).find((p) => p.key === input.promptKey);
  if (!prompt) return { ok: false, reason: "This prompt is no longer available" };

  const consentAt = new Date();
  try {
    await prisma.pollElaborationAnswer.create({
      data: {
        responseId: input.responseId,
        programId: response.programId,
        promptKey: prompt.key,
        promptText: prompt.text,
        text: input.text,
        consentGiven: true,
        consentAt,
        consentLabel: POLL_ELABORATION_CONSENT_LABEL,
      },
    });
    return { ok: true, skipped: false };
  } catch (err) {
    if (isUniqueConstraintError(err)) return { ok: true, skipped: true };
    throw err;
  }
}

/** Prompt keys this response has already answered -- feeds the client's chooser so
 * "Answer another" (and a page reload mid-block) never re-offers an already-answered
 * prompt. Degrades to empty before the migration lands (see isMissingTableError). */
export async function listAnsweredPromptKeys(responseId: string): Promise<string[]> {
  try {
    const rows = await prisma.pollElaborationAnswer.findMany({
      where: { responseId },
      select: { promptKey: true },
    });
    return rows.map((r) => r.promptKey);
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

export type PollElaborationFilter = {
  status?: PollReviewStatus;
  programId?: string;
};

/** Batch-computes the same three moderation attention signals PollReview's queue uses,
 * over elaboration answers' parent responses -- re-exported logic would duplicate the
 * query, so this just re-shapes rows into what lib/pollReviews.ts's internal
 * computeAttentionFlags expects and calls listReviewQueue's sibling indirectly via a
 * parallel, identical implementation is avoided by importing the shared computation
 * below (see the import from lib/pollReviews.ts's re-exported helper). */
async function computeSharedAttentionFlags(
  responses: { id: string; programId: string; ipHash: string; email: string | null; referrerTokenId: string | null }[]
): Promise<Map<string, ReviewAttentionFlag[]>> {
  const flagsByResponseId = new Map<string, ReviewAttentionFlag[]>();
  if (responses.length === 0) return flagsByResponseId;

  const programIds = [...new Set(responses.map((r) => r.programId))];
  const tokenIds = [...new Set(responses.map((r) => r.referrerTokenId).filter((id): id is string => id !== null))];

  const [ipGroups, tokens, tokenResponseCounts, programs] = await Promise.all([
    prisma.pollResponse.groupBy({
      by: ["programId", "ipHash"],
      where: { programId: { in: programIds }, status: { not: "VOIDED" } },
      _count: { _all: true },
    }),
    tokenIds.length > 0 ? prisma.referrerToken.findMany({ where: { id: { in: tokenIds } } }) : Promise.resolve([]),
    tokenIds.length > 0
      ? prisma.pollResponse.groupBy({
          by: ["referrerTokenId"],
          where: { referrerTokenId: { in: tokenIds }, status: { not: "VOIDED" } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.program.findMany({ where: { id: { in: programIds } }, select: { id: true, contactEmail: true } }),
  ]);

  const sharedIpKeys = new Set(ipGroups.filter((g) => g._count._all > 1).map((g) => `${g.programId}::${g.ipHash}`));
  const responseCountByToken = new Map(tokenResponseCounts.map((c) => [c.referrerTokenId, c._count._all]));
  const overCapTokenIds = new Set(
    tokens.filter((t) => t.maxResponses !== null && (responseCountByToken.get(t.id) ?? 0) >= t.maxResponses).map((t) => t.id)
  );
  const domainByProgram = new Map(programs.map((p) => [p.id, p.contactEmail?.split("@")[1]?.toLowerCase() ?? null]));

  for (const response of responses) {
    const flags: ReviewAttentionFlag[] = [];
    if (sharedIpKeys.has(`${response.programId}::${response.ipHash}`)) flags.push(REVIEW_ATTENTION_FLAGS.SHARED_IP);
    if (response.referrerTokenId && overCapTokenIds.has(response.referrerTokenId)) {
      flags.push(REVIEW_ATTENTION_FLAGS.TOKEN_OVER_CAP);
    }
    const programDomain = domainByProgram.get(response.programId);
    const emailDomain = response.email?.split("@")[1]?.toLowerCase();
    if (programDomain && emailDomain && programDomain === emailDomain) {
      flags.push(REVIEW_ATTENTION_FLAGS.EMAIL_DOMAIN_MATCHES_PROGRAM);
    }
    flagsByResponseId.set(response.id, flags);
  }

  return flagsByResponseId;
}

/** The moderation queue for elaboration answers -- default PENDING, capped at 200,
 * mirroring lib/pollReviews.ts's listReviewQueue shape so PollReviewQueue.tsx can render
 * both kinds of row with one component. */
export async function listElaborationQueue(filter: PollElaborationFilter = {}) {
  let answers;
  try {
    answers = await prisma.pollElaborationAnswer.findMany({
      where: {
        status: filter.status ?? "PENDING",
        ...(filter.programId ? { programId: filter.programId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        program: { select: { name: true, slug: true } },
        response: {
          include: {
            referrerToken: { select: { label: true } },
            answers: { include: { question: { select: { key: true, text: true } } } },
          },
        },
      },
    });
  } catch (err) {
    // Called directly (awaited, inside Promise.all) from a Server Component
    // (app/admin/polls/reviews/page.tsx) -- an uncaught throw here doesn't just fail
    // silently, it fails the WHOLE page, taking listReviewQueue/listStandaloneReviewQueue
    // down with it via Promise.all's all-or-nothing semantics. Same isMissingTableError
    // degrade-to-empty posture as every other public/admin read in this file.
    if (isMissingTableError(err)) return [];
    throw err;
  }

  const attentionByResponseId = await computeSharedAttentionFlags(
    answers.map((a) => ({
      id: a.response.id,
      programId: a.response.programId,
      ipHash: a.response.ipHash,
      email: a.response.email,
      referrerTokenId: a.response.referrerTokenId,
    }))
  );

  return answers.map((a) => ({
    ...a,
    attentionFlags: attentionByResponseId.get(a.response.id) ?? [],
  }));
}

export async function countPendingElaborationAnswers(): Promise<number> {
  try {
    return await prisma.pollElaborationAnswer.count({ where: { status: "PENDING" } });
  } catch (err) {
    if (isMissingTableError(err)) return 0;
    throw err;
  }
}

export type ModerateElaborationResult = { ok: true } | { ok: false; reason: string };

/**
 * Approves an elaboration answer -- refuses only while the parent response is VOIDED or
 * FLAGGED. Deliberately NOT the stricter "must be COUNTED" gate approvePollReview uses:
 * finalizeReferenceFromPoll's documented reasoning applies here too -- how much of the
 * ratings poll someone finished is an unrelated question to whether their written answer
 * is worth publishing. FLAGGED still blocks, since that's an active anti-abuse hold an
 * admin hasn't resolved yet; once they approve the response (moving it to COUNTED) or void
 * it, this gate re-evaluates accordingly. Nothing here or anywhere else auto-approves.
 */
export async function approveElaborationAnswer(id: string, moderatorId: string): Promise<ModerateElaborationResult> {
  let answer;
  try {
    answer = await prisma.pollElaborationAnswer.findUnique({
      where: { id },
      select: { response: { select: { status: true } } },
    });
  } catch (err) {
    // A missing table means this id can't possibly exist yet -- same result shape as the
    // ordinary "not found" case just below, not a throw. See listElaborationQueue's
    // identical guard for why this matters: this function's caller (the PATCH route)
    // catches unexpected errors as a 500, which "not found" (400) is not.
    if (isMissingTableError(err)) return { ok: false, reason: "Answer not found" };
    throw err;
  }
  if (!answer) return { ok: false, reason: "Answer not found" };
  if (answer.response.status === "VOIDED") return { ok: false, reason: "The parent response was voided" };
  if (answer.response.status === "FLAGGED") return { ok: false, reason: "The parent response is flagged for review" };

  await prisma.pollElaborationAnswer.update({
    where: { id },
    data: { status: "APPROVED", moderatedBy: moderatorId, moderatedAt: new Date() },
  });
  return { ok: true };
}

/** Rejected answers are retained, never deleted, same as PollReview. */
export async function rejectElaborationAnswer(
  id: string,
  moderatorId: string,
  note?: string
): Promise<ModerateElaborationResult> {
  let answer;
  try {
    answer = await prisma.pollElaborationAnswer.findUnique({ where: { id }, select: { id: true } });
  } catch (err) {
    if (isMissingTableError(err)) return { ok: false, reason: "Answer not found" };
    throw err;
  }
  if (!answer) return { ok: false, reason: "Answer not found" };

  await prisma.pollElaborationAnswer.update({
    where: { id },
    data: { status: "REJECTED", moderatedBy: moderatorId, moderatedAt: new Date(), moderatorNote: note ?? null },
  });
  return { ok: true };
}

export async function bulkRejectElaborationAnswers(
  ids: string[],
  moderatorId: string,
  note?: string
): Promise<{ count: number }> {
  try {
    const result = await prisma.pollElaborationAnswer.updateMany({
      where: { id: { in: ids }, status: "PENDING" },
      data: { status: "REJECTED", moderatedBy: moderatorId, moderatedAt: new Date(), moderatorNote: note ?? null },
    });
    return { count: result.count };
  } catch (err) {
    // A missing table can't have matched any of these ids -- 0 updated is the honest,
    // non-throwing answer. The caller (the bulk-reject route) additionally skips its own
    // follow-up revalidation query entirely when count is 0, so this alone is enough to
    // keep the whole request from 500ing.
    if (isMissingTableError(err)) return { count: 0 };
    throw err;
  }
}

export type ModerateElaborationWithProgramResult = { ok: true; programId: string } | { ok: false; reason: string };

/** Reversibly takes an already-approved answer off the public program page. Mirrors
 * lib/pollReviews.ts's archivePollReview exactly. */
export async function archiveElaborationAnswer(
  id: string,
  moderatorId: string,
  note?: string
): Promise<ModerateElaborationWithProgramResult> {
  let answer;
  try {
    answer = await prisma.pollElaborationAnswer.findUnique({ where: { id }, select: { status: true, programId: true } });
  } catch (err) {
    if (isMissingTableError(err)) return { ok: false, reason: "Answer not found" };
    throw err;
  }
  if (!answer) return { ok: false, reason: "Answer not found" };
  if (answer.status !== "APPROVED") return { ok: false, reason: "Only an approved answer can be archived" };

  const archivedAt = new Date();
  await prisma.pollElaborationAnswer.update({
    where: { id },
    data: {
      status: "ARCHIVED",
      moderatedBy: moderatorId,
      moderatedAt: archivedAt,
      moderatorNote: note ?? null,
      archivedAt,
      archivedBy: moderatorId,
    },
  });
  return { ok: true, programId: answer.programId };
}

/** Restores an archived answer to public view. Re-checks the same VOIDED/FLAGGED gate
 * approveElaborationAnswer enforces -- the response could have changed state while this
 * answer sat archived. */
export async function restoreElaborationAnswer(id: string, moderatorId: string): Promise<ModerateElaborationWithProgramResult> {
  let answer;
  try {
    answer = await prisma.pollElaborationAnswer.findUnique({
      where: { id },
      select: { status: true, programId: true, response: { select: { status: true } } },
    });
  } catch (err) {
    if (isMissingTableError(err)) return { ok: false, reason: "Answer not found" };
    throw err;
  }
  if (!answer) return { ok: false, reason: "Answer not found" };
  if (answer.status !== "ARCHIVED") return { ok: false, reason: "Only an archived answer can be restored" };
  if (answer.response.status === "VOIDED") return { ok: false, reason: "The parent response was voided" };
  if (answer.response.status === "FLAGGED") return { ok: false, reason: "The parent response is flagged for review" };

  await prisma.pollElaborationAnswer.update({
    where: { id },
    data: {
      status: "APPROVED",
      moderatedBy: moderatorId,
      moderatedAt: new Date(),
      moderatorNote: null,
      archivedAt: null,
      archivedBy: null,
    },
  });
  return { ok: true, programId: answer.programId };
}

/** Permanently removes an elaboration answer row. Distinct from archive/reject's
 * retain-never-delete posture -- the de-emphasised, irreversible action for spam or legal
 * removal, mirroring hardDeletePollReview. */
export async function hardDeleteElaborationAnswer(id: string): Promise<{ programId: string } | null> {
  let answer;
  try {
    answer = await prisma.pollElaborationAnswer.findUnique({ where: { id }, select: { programId: true } });
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
  if (!answer) return null;
  await prisma.pollElaborationAnswer.delete({ where: { id } });
  return { programId: answer.programId };
}

export type ElaborationGroupDTO = {
  promptKey: string;
  promptText: string;
  answers: { text: string; yearAttended: number | null }[];
};

/**
 * Public, approved elaboration answers for a program, grouped by prompt in the live
 * (enabled) prompt order -- an approved answer whose prompt has since been disabled or
 * removed still appears, appended after the ordered groups, same "never silently drop"
 * posture as listPublicReviews. Publishing is a query-time join against the parent
 * response's live status (APPROVED + response not VOIDED/FLAGGED) -- no stored publish
 * flag, so voiding a response hides its approved answers with zero writes here. Degrades
 * to empty before the migration lands (see isMissingTableError).
 */
export async function listPublicElaborations(programId: string): Promise<ElaborationGroupDTO[]> {
  let rows;
  try {
    rows = await prisma.pollElaborationAnswer.findMany({
      where: {
        programId,
        status: "APPROVED",
        response: { status: { notIn: ["VOIDED", "FLAGGED"] } },
      },
      select: {
        text: true,
        promptKey: true,
        promptText: true,
        response: { select: { yearAttended: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
  if (rows.length === 0) return [];

  const byPromptKey = new Map<string, ElaborationGroupDTO>();
  for (const row of rows) {
    const existing = byPromptKey.get(row.promptKey);
    const item = { text: row.text, yearAttended: row.response.yearAttended };
    if (existing) {
      existing.answers.push(item);
    } else {
      byPromptKey.set(row.promptKey, { promptKey: row.promptKey, promptText: row.promptText, answers: [item] });
    }
  }

  const config = await getElaborationPromptsConfig();
  const orderedKeys = enabledPrompts(config).map((p) => p.key);
  const ordered: ElaborationGroupDTO[] = [];
  const seen = new Set<string>();
  for (const key of orderedKeys) {
    const group = byPromptKey.get(key);
    if (group) {
      ordered.push(group);
      seen.add(key);
    }
  }
  for (const [key, group] of byPromptKey) {
    if (!seen.has(key)) ordered.push(group);
  }
  return ordered;
}
