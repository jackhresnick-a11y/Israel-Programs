import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listReviewQueue } from "@/lib/pollReviews";
import { listPublishedProgramNames } from "@/lib/programs";
import type { PollReviewStatus } from "@/app/generated/prisma/enums";
import PollReviewQueue from "@/components/admin/polls/PollReviewQueue";

const VALID_STATUSES: PollReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export default async function AdminPollsReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; programId?: string }>;
}) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const sp = await searchParams;
  const status = VALID_STATUSES.includes(sp.status as PollReviewStatus) ? (sp.status as PollReviewStatus) : "PENDING";

  const [reviews, programs] = await Promise.all([
    listReviewQueue({ status, programId: sp.programId || undefined }),
    listPublishedProgramNames(),
  ]);

  return (
    <PollReviewQueue
      reviews={reviews}
      programs={programs}
      filters={{ status, programId: sp.programId ?? "" }}
    />
  );
}
