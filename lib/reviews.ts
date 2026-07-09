import { prisma } from "@/lib/prisma";

export type RecentReview = {
  id: string;
  rating: number;
  text: string;
  reviewerName: string;
  createdAt: Date;
  program: { name: string; slug: string };
};

/** Newest reviews across all published programs. Deliberately excludes `userId`. */
export async function listRecentReviews(limit = 3): Promise<RecentReview[]> {
  return prisma.review.findMany({
    where: { program: { status: "PUBLISHED" } },
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
