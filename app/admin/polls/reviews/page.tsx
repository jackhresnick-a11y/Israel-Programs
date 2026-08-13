import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listReviewQueue } from "@/lib/pollReviews";
import { listElaborationQueue } from "@/lib/pollElaborations";
import { listStandaloneReviewQueue } from "@/lib/reviews";
import { listPublishedProgramNames } from "@/lib/programs";
import { getUsersByIds } from "@/lib/clerkUsers";
import type { PollReviewStatus } from "@/app/generated/prisma/enums";
import PollReviewQueue, { type PollReviewRow } from "@/components/admin/polls/PollReviewQueue";
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

  const [reviews, elaborationAnswers, standaloneReviews, programs] = await Promise.all([
    listReviewQueue({ status, programId: sp.programId || undefined }),
    listElaborationQueue({ status, programId: sp.programId || undefined }),
    listStandaloneReviewQueue({ status: POLL_TO_STANDALONE_STATUS[status], programId: sp.programId || undefined }),
    listPublishedProgramNames(),
  ]);

  // Resolve archivedBy (a raw Clerk id) to a display name up front, same batch-resolve
  // pattern as app/admin/page.tsx's `submitters` -- never pass a raw id or a Map across
  // the client-component prop boundary, so each row gets its name pre-attached here.
  const archiverIds = [
    ...reviews.map((r) => r.archivedBy),
    ...elaborationAnswers.map((a) => a.archivedBy),
    ...standaloneReviews.map((r) => r.archivedBy),
  ].filter((id): id is string => Boolean(id));
  const archivers = await getUsersByIds(archiverIds);
  const withArchiverName = <T extends { archivedBy: string | null }>(row: T) => ({
    ...row,
    archivedByName: row.archivedBy ? (archivers.get(row.archivedBy)?.name ?? "Unknown") : null,
  });

  // Elaboration answers join PollReview in one merged queue (poll restructure item --
  // one moderation surface, not a second page): reshaped into the same row shape
  // PollReviewQueue renders, with `question` standing in for the prompt's key/text so no
  // rendering branch is needed for that field. Merged rows sort oldest-first, matching
  // each individual query's own `orderBy: { createdAt: "asc" }`.
  const pollReviewRows: PollReviewRow[] = reviews.map((r) => ({ ...withArchiverName(r), kind: "question" as const }));
  const elaborationRows: PollReviewRow[] = elaborationAnswers.map((a) => ({
    ...withArchiverName(a),
    kind: "prompt" as const,
    question: { key: a.promptKey, text: a.promptText },
  }));
  const mergedRows = [...pollReviewRows, ...elaborationRows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  return (
    <div className="flex flex-col gap-8">
      <PollReviewQueue
        reviews={mergedRows}
        programs={programs}
        filters={{ status, programId: sp.programId ?? "" }}
      />
      <StandaloneReviewQueue reviews={standaloneReviews.map(withArchiverName)} />
    </div>
  );
}
