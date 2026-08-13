import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { countPendingReviews } from "@/lib/pollReviews";
import { countPendingElaborationAnswers } from "@/lib/pollElaborations";
import { countPendingStandaloneReviews } from "@/lib/reviews";
import { countPendingQuestions } from "@/lib/programFaq";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import PollsTabs from "@/components/admin/PollsTabs";

export default async function AdminPollsLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [pendingPollReviewCount, pendingElaborationCount, pendingStandaloneReviewCount, pendingQuestionCount] =
    await Promise.all([
      countPendingReviews(),
      countPendingElaborationAnswers(),
      countPendingStandaloneReviews(),
      countPendingQuestions(),
    ]);
  const pendingReviewCount = pendingPollReviewCount + pendingElaborationCount + pendingStandaloneReviewCount;

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Alumni Ratings"
        description="Questions, buckets, per-program config, outreach links, moderation, reviews, and FAQs for the ratings poll."
      />
      <PollsTabs pendingReviewCount={pendingReviewCount} pendingQuestionCount={pendingQuestionCount} />
      {children}
    </PageContainer>
  );
}
