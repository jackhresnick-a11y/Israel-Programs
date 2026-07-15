import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listOutreachTemplates } from "@/lib/outreachTemplates";
import OutreachTemplateManager from "@/components/OutreachTemplateManager";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminEmailTemplatesPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const templates = await listOutreachTemplates();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Saved email templates"
        description="Write and keep multiple outreach email templates for different program types, then pick one when generating drafts."
      />
      <OutreachTemplateManager templates={templates} />
    </div>
  );
}
