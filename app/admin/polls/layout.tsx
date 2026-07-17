import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import PollsTabs from "@/components/admin/PollsTabs";

export default async function AdminPollsLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Alumni Ratings"
        description="Questions, buckets, per-program config, outreach links, and moderation for the ratings poll."
      />
      <PollsTabs />
      {children}
    </PageContainer>
  );
}
