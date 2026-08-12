import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import FlowTabs from "@/components/admin/FlowTabs";

export default async function AdminFlowLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Match flow (v2)"
        description="The weighted, video-argued question flow at /match -- questions, options, branching rules, and (soon) clips, all admin-editable with no deploy. /find (v1) is unaffected and stays live separately."
      />
      <FlowTabs />
      {children}
    </PageContainer>
  );
}
