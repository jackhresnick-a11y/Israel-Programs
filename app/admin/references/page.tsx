import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listAllReferencesForAdmin } from "@/lib/references";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import ReferenceWhatsappEditor from "@/components/ReferenceWhatsappEditor";

const STATUS_TONE = { PUBLISHED: "success", PENDING: "warning", REJECTED: "danger" } as const;

export default async function AdminReferencesPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const references = await listAllReferencesForAdmin();

  return (
    <PageContainer width="base">
      <PageHeader
        title="References"
        description="Alumni references across all programs, including their WhatsApp number and its source. Never shown publicly."
      />
      {references.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No references yet.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {references.map((reference) => (
            <div key={reference.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link
                    href={`/programs/${reference.program.slug}`}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {reference.displayName} — {reference.program.name}
                  </Link>
                  <p className="text-xs text-muted">
                    Attended {reference.attendedText} · contact {reference.contactEmail} ·{" "}
                    {new Date(reference.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[reference.status]}>{reference.status}</Badge>
              </div>
              {reference.note && <p className="text-sm text-foreground/80">{reference.note}</p>}
              <ReferenceWhatsappEditor
                referenceId={reference.id}
                whatsappNumber={reference.whatsappNumber}
                whatsappNumberSource={reference.whatsappNumberSource}
              />
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
