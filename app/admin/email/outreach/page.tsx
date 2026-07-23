import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listOutreachQueue } from "@/lib/outreach";
import { getSiteContent } from "@/lib/siteContent";
import { listOutreachTemplates } from "@/lib/outreachTemplates";
import OutreachManager from "@/components/OutreachManager";
import PageHeader from "@/components/ui/PageHeader";
import { buttonVariants } from "@/components/ui/Button";

export default async function AdminEmailOutreachPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [{ eligible, needsSourceCheck }, subjectTemplate, bodyTemplate, batchSize, savedTemplates] = await Promise.all([
    listOutreachQueue(),
    getSiteContent("outreachSubjectTemplate"),
    getSiteContent("outreachBodyTemplate"),
    getSiteContent("outreachBatchSize"),
    listOutreachTemplates(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Outreach: verify your listing"
        description="Draft, review, and send personalized 'verify your listing' emails to program contacts with a sourced address. Sending is manual and batch-based -- nothing goes out until you approve it and click Send."
        actions={
          <a
            href="/api/admin/outreach-contacts.csv"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Download outreach contacts CSV
          </a>
        }
      />
      <OutreachManager
        eligible={eligible}
        needsSourceCheck={needsSourceCheck}
        templates={{
          outreachSubjectTemplate: subjectTemplate ?? "",
          outreachBodyTemplate: bodyTemplate ?? "",
          outreachBatchSize: batchSize ?? "30",
        }}
        savedTemplates={savedTemplates.map((t) => ({ id: t.id, name: t.name }))}
      />
    </div>
  );
}
