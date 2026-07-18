import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { countPendingReviews } from "@/lib/pollReviews";
import { countPendingQuestions } from "@/lib/programFaq";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import PollsTabs from "@/components/admin/PollsTabs";

export default async function AdminPollsLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [pendingReviewCount, pendingQuestionCount] = await Promise.all([
    countPendingReviews(),
    countPendingQuestions(),
  ]);

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
