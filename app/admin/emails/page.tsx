import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listProgramContactEmails } from "@/lib/programs";
import { isEmailVerificationFresh } from "@/lib/emailVerification";
import EmailListTable from "@/components/EmailListTable";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminEmailsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const programs = await listProgramContactEmails();
  // Computed server-side (isEmailVerificationFresh lives in lib/emailVerification.ts,
  // which imports lib/prisma -- can't be imported into the "use client" table below)
  // using the exact same staleness rule as /admin/email-verification's queue, so the
  // two pages can never disagree about what counts as "not yet verified."
  const rows = programs.map((p) => ({
    ...p,
    needsVerification: Boolean(p.contactEmail) && !isEmailVerificationFresh(p.contactEmailVerifiedAt),
  }));

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Program contact emails"
        description="Select programs, then open a Gmail draft with everyone BCC'd. This list grows automatically as programs are added."
      />
      <EmailListTable programs={rows} />
    </PageContainer>
  );
}
