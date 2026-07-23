import { prisma } from "@/lib/prisma";
import { resolveTagsByName } from "@/lib/tags";

/** PENDING pending-tag rows (unknown-tag-name requests from non-moderator program
 * submissions), joined to the program they were requested on, for the admin queue. */
export async function listPendingTags() {
  return prisma.pendingTag.findMany({
    where: { status: "PENDING" },
    include: { program: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Accepting a pending-tag request resolves/creates the real Tag (moderator-authored,
 * so live creation here is fine -- same resolveTagsByName every other moderator-gated
 * write path uses) and connects it to the program, then marks the row APPROVED. */
export async function approvePendingTag(id: string, reviewerId: string) {
  const pendingTag = await prisma.pendingTag.findUniqueOrThrow({ where: { id } });
  const [tag] = await resolveTagsByName([pendingTag.name]);

  return prisma.$transaction([
    prisma.program.update({
      where: { id: pendingTag.programId },
      data: { tags: { connect: tag } },
    }),
    prisma.pendingTag.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: reviewerId, reviewedAt: new Date() },
    }),
  ]);
}

/** Retain-never-delete, same posture as ReviewStatus/PollReviewStatus elsewhere --
 * a rejected request stays as a record rather than being removed. */
export async function rejectPendingTag(id: string, reviewerId: string) {
  return prisma.pendingTag.update({
    where: { id },
    data: { status: "REJECTED", reviewedById: reviewerId, reviewedAt: new Date() },
  });
}
