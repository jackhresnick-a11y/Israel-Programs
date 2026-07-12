import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listOutreachQueue } from "@/lib/outreach";
import { getSiteContent } from "@/lib/siteContent";
import OutreachManager from "@/components/OutreachManager";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminOutreachPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [{ eligible, needsSourceCheck }, subjectTemplate, bodyTemplate, batchSize] = await Promise.all([
    listOutreachQueue(),
    getSiteContent("outreachSubjectTemplate"),
    getSiteContent("outreachBodyTemplate"),
    getSiteContent("outreachBatchSize"),
  ]);

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Outreach: verify your listing"
        description="Draft, review, and send personalized 'verify your listing' emails to program contacts with a sourced address. Sending is manual and batch-based -- nothing goes out until you approve it and click Send."
      />
      <OutreachManager
        eligible={eligible}
        needsSourceCheck={needsSourceCheck}
        templates={{
          outreachSubjectTemplate: subjectTemplate ?? "",
          outreachBodyTemplate: bodyTemplate ?? "",
          outreachBatchSize: batchSize ?? "30",
        }}
      />
    </PageContainer>
  );
}
