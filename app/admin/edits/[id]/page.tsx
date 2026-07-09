import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentRole } from "@/lib/roles";
import { getEditForReview } from "@/lib/programEdits";
import { getUsersByIds } from "@/lib/clerkUsers";
import { listDurationOptions } from "@/lib/duration";
import EditReviewForm from "@/components/EditReviewForm";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function EditReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getCurrentRole();
  if (role !== "moderator" && role !== "admin") redirect("/");

  const { id } = await params;
  const edit = await getEditForReview(id).catch(() => null);
  if (!edit) notFound();

  const [submitters, durationOptions] = await Promise.all([
    getUsersByIds([edit.submittedById]),
    listDurationOptions(),
  ]);
  const submitter = submitters.get(edit.submittedById);

  return (
    <PageContainer width="narrow" className="gap-6">
      <PageHeader
        title={`Review edit to ${edit.program.name}`}
        description={
          <>
            Submitted by{" "}
            <span className="font-medium text-foreground">
              {submitter?.name ?? "Unknown"}
            </span>
            {submitter?.email ? ` (${submitter.email})` : ""} on{" "}
            {new Date(edit.createdAt).toLocaleDateString()}
          </>
        }
      >
        <Link
          href={`/programs/${edit.program.slug}`}
          className="mt-1 inline-block text-sm text-accent-hover hover:underline dark:text-accent"
        >
          View current program
        </Link>
      </PageHeader>

      {edit.fieldDecisions.length === 0 ? (
        <p className="text-sm text-muted">
          No field changes detected (the edit may only affect the logo). You
          can still reject it from the admin queue.
        </p>
      ) : (
        <EditReviewForm
          editId={edit.id}
          programSlug={edit.program.slug}
          decisions={edit.fieldDecisions.map((d) => ({
            fieldName: d.fieldName,
            proposedValue: d.proposedValue,
            finalValue: d.finalValue,
          }))}
          submitterId={edit.submittedById}
          submitterName={submitter?.name ?? "this user"}
          durationOptions={durationOptions}
        />
      )}
    </PageContainer>
  );
}
