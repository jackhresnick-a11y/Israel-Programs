import { prisma } from "@/lib/prisma";
import type { PollReviewStatus } from "@/app/generated/prisma/enums";

export const REVIEW_ATTENTION_FLAGS = {
  SHARED_IP: "shared_ip",
  TOKEN_OVER_CAP: "token_over_cap",
  EMAIL_DOMAIN_MATCHES_PROGRAM: "email_domain_matches_program",
} as const;

export type ReviewAttentionFlag = (typeof REVIEW_ATTENTION_FLAGS)[keyof typeof REVIEW_ATTENTION_FLAGS];

export type PollReviewFilter = {
  status?: PollReviewStatus;
  programId?: string;
};

/**
 * Batch-computes the three moderation attention signals for a page of reviews, each as
 * a fresh live check rather than trusting a stale flag stored at submission time:
 * - shared_ip: >1 non-voided response for the same program shares this response's
 *   ipHash. Distinct from PollResponse.flags' `repeat_ip` (set only on the *second and
 *   later* submission from an ipHash) -- this recomputes so the *first* response in a
 *   shared-ipHash pair is flagged too.
 * - token_over_cap: the parent response's referrer token is *currently* at or over its
 *   cap, recomputed live rather than read from the response's stored flags (which
 *   reflect the token's cap state at submission time -- a token can cross its cap
 *   later, after an earlier response already saved without the flag).
 * - email_domain_matches_program: the response's email domain matches
 *   Program.contactEmail's domain (never Organization.contactEmail -- an umbrella
 *   address shared across many programs would false-positive on every one of them).
 */
async function computeAttentionFlags(
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

  const sharedIpKeys = new Set(
    ipGroups.filter((g) => g._count._all > 1).map((g) => `${g.programId}::${g.ipHash}`)
  );
  const responseCountByToken = new Map(tokenResponseCounts.map((c) => [c.referrerTokenId, c._count._all]));
  const overCapTokenIds = new Set(
    tokens.filter((t) => t.maxResponses !== null && (responseCountByToken.get(t.id) ?? 0) >= t.maxResponses).map((t) => t.id)
  );
  const domainByProgram = new Map(
    programs.map((p) => [p.id, p.contactEmail?.split("@")[1]?.toLowerCase() ?? null])
  );

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

/** The moderation queue -- default PENDING, capped at 200 most-recent matches. Includes
 * the full parent response (answers, verified/counted state, token label) for context,
 * same "sensitive fields are fine past the admin gate" posture as
 * lib/pollResponses.ts's listPollResponses. */
export async function listReviewQueue(filter: PollReviewFilter = {}) {
  const reviews = await prisma.pollReview.findMany({
    where: {
      status: filter.status ?? "PENDING",
      ...(filter.programId ? { programId: filter.programId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      question: { select: { key: true, text: true } },
      program: { select: { name: true, slug: true } },
      response: {
        include: {
          referrerToken: { select: { label: true } },
          answers: { include: { question: { select: { key: true, text: true } } } },
        },
      },
    },
  });

  const attentionByResponseId = await computeAttentionFlags(
    reviews.map((r) => ({
      id: r.response.id,
      programId: r.response.programId,
      ipHash: r.response.ipHash,
      email: r.response.email,
      referrerTokenId: r.response.referrerTokenId,
    }))
  );

  return reviews.map((r) => ({
    ...r,
    attentionFlags: attentionByResponseId.get(r.response.id) ?? [],
  }));
}

export async function countPendingReviews(): Promise<number> {
  return prisma.pollReview.count({ where: { status: "PENDING" } });
}

export type ModerateReviewResult = { ok: true } | { ok: false; reason: string };

/**
 * Approves a review -- refuses unless the parent PollResponse is already `COUNTED`
 * AND `verified`. An unverified anonymous response's reviews sit PENDING and
 * unapprovable until the magic link is clicked (or the response is voided, at which
 * point approving it is moot). Nothing here or anywhere else auto-approves.
 */
export async function approvePollReview(id: string, moderatorId: string): Promise<ModerateReviewResult> {
  const review = await prisma.pollReview.findUnique({
    where: { id },
    select: { response: { select: { status: true, verified: true } } },
  });
  if (!review) return { ok: false, reason: "Review not found" };
  if (review.response.status !== "COUNTED" || !review.response.verified) {
    return { ok: false, reason: "The parent response isn't verified and counted yet" };
  }

  await prisma.pollReview.update({
    where: { id },
    data: { status: "APPROVED", moderatedBy: moderatorId, moderatedAt: new Date() },
  });
  return { ok: true };
}

/** Rejected reviews are retained, never deleted, same as voided responses. */
export async function rejectPollReview(id: string, moderatorId: string, note?: string): Promise<ModerateReviewResult> {
  const review = await prisma.pollReview.findUnique({ where: { id }, select: { id: true } });
  if (!review) return { ok: false, reason: "Review not found" };

  await prisma.pollReview.update({
    where: { id },
    data: { status: "REJECTED", moderatedBy: moderatorId, moderatedAt: new Date(), moderatorNote: note ?? null },
  });
  return { ok: true };
}

export async function bulkRejectPollReviews(ids: string[], moderatorId: string, note?: string): Promise<{ count: number }> {
  const result = await prisma.pollReview.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "REJECTED", moderatedBy: moderatorId, moderatedAt: new Date(), moderatorNote: note ?? null },
  });
  return { count: result.count };
}
