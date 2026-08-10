import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listReviewQueue } from "@/lib/pollReviews";
import { listStandaloneReviewQueue } from "@/lib/reviews";
import { listPublishedProgramNames } from "@/lib/programs";
import type { PollReviewStatus } from "@/app/generated/prisma/enums";
import PollReviewQueue from "@/components/admin/polls/PollReviewQueue";
import StandaloneReviewQueue from "@/components/admin/polls/StandaloneReviewQueue";

const VALID_STATUSES: PollReviewStatus[] = ["PENDING", "APPROVED", "REJECTED", "ARCHIVED"];

// The standalone Review model calls its "live" state PUBLISHED, not APPROVED (matches
// its own status column, see ReviewStatus in prisma/schema.prisma) -- one shared
// PENDING/APPROVED/REJECTED/ARCHIVED filter bar drives both queues via this mapping,
// rather than showing two separate status dropdowns for what is, from an admin's
// perspective, one moderation page. ARCHIVED is spelled the same in both enums, so that
// one entry is trivial -- kept explicit anyway so the map stays total over
// PollReviewStatus and a future enum value fails type-checking here instead of silently
// falling through.
const POLL_TO_STANDALONE_STATUS = {
  PENDING: "PENDING",
  APPROVED: "PUBLISHED",
  REJECTED: "REJECTED",
  ARCHIVED: "ARCHIVED",
} as const;

export default async function AdminPollsReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; programId?: string }>;
}) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const sp = await searchParams;
  const status = VALID_STATUSES.includes(sp.status as PollReviewStatus) ? (sp.status as PollReviewStatus) : "PENDING";

  const [reviews, standaloneReviews, programs] = await Promise.all([
    listReviewQueue({ status, programId: sp.programId || undefined }),
    listStandaloneReviewQueue({ status: POLL_TO_STANDALONE_STATUS[status], programId: sp.programId || undefined }),
    listPublishedProgramNames(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PollReviewQueue
        reviews={reviews}
        programs={programs}
        filters={{ status, programId: sp.programId ?? "" }}
      />
      <StandaloneReviewQueue reviews={standaloneReviews} />
    </div>
  );
}
