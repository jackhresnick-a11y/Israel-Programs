import { listProgramContactEmails } from "@/lib/programs";
import { isEmailVerificationFresh } from "@/lib/emailVerification";
import EmailListTable from "@/components/EmailListTable";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminEmailContactsPage() {
  const programs = await listProgramContactEmails();
  // Computed server-side (isEmailVerificationFresh lives in lib/emailVerification.ts,
  // which imports lib/prisma -- can't be imported into the "use client" table below)
  // using the exact same staleness rule as the verification tab's queue, so the two
  // tabs can never disagree about what counts as "not yet verified."
  const rows = programs.map((p) => ({
    ...p,
    needsVerification: Boolean(p.contactEmail) && !isEmailVerificationFresh(p.contactEmailVerifiedAt),
  }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Program contact emails"
        description="Select programs, then open a Gmail draft with everyone BCC'd. This list grows automatically as programs are added."
      />
      <EmailListTable programs={rows} />
    </div>
  );
}
