import { prisma } from "@/lib/prisma";
import type { ReviewStatus } from "@/app/generated/prisma/enums";

export type RecentReview = {
  id: string;
  rating: number;
  text: string;
  reviewerName: string;
  createdAt: Date;
  program: { name: string; slug: string };
};

/** Newest PUBLISHED reviews across all published programs -- admin dashboard and
 * homepage widget, both public-facing surfaces, so pending/unmoderated text never
 * shows here. Deliberately excludes `userId`. */
export async function listRecentReviews(limit = 3): Promise<RecentReview[]> {
  return prisma.review.findMany({
    where: { status: "PUBLISHED", program: { status: "PUBLISHED" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      rating: true,
      text: true,
      reviewerName: true,
      createdAt: true,
      program: { select: { name: true, slug: true } },
    },
  });
}

export type PublicStandaloneReview = {
  id: string;
  rating: number;
  text: string;
  reviewerName: string | null;
  createdAt: Date;
};

/** Approved standalone reviews for one program's public Reviews section -- `status =
 * PUBLISHED` only. `reviewerName` is only selected (and returned) when the review
 * wasn't posted anonymously; `userId` is never selected at all -- same RSC-payload-leak
 * discipline as lib/pollResults.ts's listPublicReviews. */
export async function listPublicStandaloneReviews(programId: string): Promise<PublicStandaloneReview[]> {
  const rows = await prisma.review.findMany({
    where: { programId, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, rating: true, text: true, reviewerName: true, isAnonymous: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    text: r.text,
    reviewerName: r.isAnonymous ? null : r.reviewerName,
    createdAt: r.createdAt,
  }));
}

export type StandaloneReviewFilter = {
  status?: ReviewStatus;
  programId?: string;
};

/** The standalone-review moderation queue -- same shape as lib/pollReviews.ts's
 * listReviewQueue (default PENDING, capped at 200 most-recent matches), rendered
 * alongside the poll-review queue on /admin/polls/reviews as one combined moderation
 * surface, even though the two models stay separate. */
export async function listStandaloneReviewQueue(filter: StandaloneReviewFilter = {}) {
  return prisma.review.findMany({
    where: {
      status: filter.status ?? "PENDING",
      ...(filter.programId ? { programId: filter.programId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      program: { select: { name: true, slug: true } },
    },
  });
}

export async function countPendingStandaloneReviews(): Promise<number> {
  return prisma.review.count({ where: { status: "PENDING" } });
}

export type ModerateStandaloneReviewResult = { ok: true } | { ok: false; reason: string };

/** Approves a standalone review -- no parent-response verified/counted gate (there is
 * no parent response for this model), so the only failure mode is a missing id. Nothing
 * auto-publishes anywhere else; this is the one write path that can set PUBLISHED. */
export async function approveStandaloneReview(id: string, moderatorId: string): Promise<ModerateStandaloneReviewResult> {
  const review = await prisma.review.findUnique({ where: { id }, select: { id: true } });
  if (!review) return { ok: false, reason: "Review not found" };

  await prisma.review.update({
    where: { id },
    data: { status: "PUBLISHED", moderatedBy: moderatorId, moderatedAt: new Date() },
  });
  return { ok: true };
}

/** Rejected reviews are retained, never deleted -- same posture as rejectPollReview. */
export async function rejectStandaloneReview(
  id: string,
  moderatorId: string,
  note?: string
): Promise<ModerateStandaloneReviewResult> {
  const review = await prisma.review.findUnique({ where: { id }, select: { id: true } });
  if (!review) return { ok: false, reason: "Review not found" };

  await prisma.review.update({
    where: { id },
    data: { status: "REJECTED", moderatedBy: moderatorId, moderatedAt: new Date(), moderatorNote: note ?? null },
  });
  return { ok: true };
}
