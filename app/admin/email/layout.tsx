import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import EmailTabs from "@/components/admin/EmailTabs";

export default async function AdminEmailLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Email"
        description="Contact emails, verification, outreach, and test sending — all in one place."
      />
      <EmailTabs />
      {children}
    </PageContainer>
  );
}
