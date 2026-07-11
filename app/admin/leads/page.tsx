import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listLeads } from "@/lib/leads";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";

export default async function AdminLeadsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const leads = await listLeads();

  return (
    <PageContainer width="narrow">
      <PageHeader title="Leads" description="Footer 'ask us' submissions, newest first." />
      {leads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No leads yet.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {leads.map((lead) => (
            <div key={lead.id} className="flex flex-col gap-1 p-4">
              <span className="text-sm font-medium text-foreground">{lead.email}</span>
              {lead.message && (
                <span className="text-sm text-foreground/80">{lead.message}</span>
              )}
              <div className="flex items-center gap-2 text-xs text-muted">
                <Badge tone="neutral">{lead.path}</Badge>
                <span>{lead.createdAt.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
