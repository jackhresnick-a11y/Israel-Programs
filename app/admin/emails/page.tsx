import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listProgramContactEmails } from "@/lib/programs";
import EmailListTable from "@/components/EmailListTable";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminEmailsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const programs = await listProgramContactEmails();

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Program contact emails"
        description="Select programs, then open a Gmail draft with everyone BCC'd. This list grows automatically as programs are added."
      />
      <EmailListTable programs={programs} />
    </PageContainer>
  );
}
