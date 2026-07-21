import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listAllReferencesForAdmin } from "@/lib/references";
import { listProgramsWithReferenceConfig } from "@/lib/referenceConfig";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import ReferenceWhatsappEditor from "@/components/ReferenceWhatsappEditor";
import ReferenceVisibilityControl from "@/components/ReferenceVisibilityControl";

const STATUS_TONE = { PUBLISHED: "success", PENDING: "warning", REJECTED: "danger" } as const;

export default async function AdminReferencesPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [references, programsWithConfig] = await Promise.all([
    listAllReferencesForAdmin(),
    listProgramsWithReferenceConfig(),
  ]);

  return (
    <PageContainer width="base">
      <PageHeader
        title="References"
        description="Alumni references across all programs, including their WhatsApp number and its source. Never shown publicly."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Public list visibility</h2>
        <p className="text-xs text-muted">
          The list auto-unlocks (and stays unlocked) once a program reaches its approved-reference
          threshold (3 by default). Force show/hide overrides that in either direction.
        </p>
        {programsWithConfig.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
            No programs have references yet.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {programsWithConfig.map((program) => (
              <div key={program.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <Link
                  href={`/programs/${program.slug}`}
                  className="text-sm font-medium text-foreground hover:underline"
                >
                  {program.name}
                </Link>
                <ReferenceVisibilityControl
                  programId={program.id}
                  approvedCount={program.approvedCount}
                  visibility={program.config.visibility}
                  unlockedAt={program.config.unlockedAt}
                  minToShow={program.config.minToShow}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">All references</h2>
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
                      {reference.requestCount} contact request{reference.requestCount === 1 ? "" : "s"} ·{" "}
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
      </section>
    </PageContainer>
  );
}
