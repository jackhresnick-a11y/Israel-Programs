import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentRole } from "@/lib/roles";
import { getEditForReview } from "@/lib/programEdits";
import { getUsersByIds } from "@/lib/clerkUsers";
import EditReviewForm from "@/components/EditReviewForm";

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

  const submitters = await getUsersByIds([edit.submittedById]);
  const submitter = submitters.get(edit.submittedById);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="border-l-4 border-amber-500 pl-4">
        <h1 className="text-2xl font-semibold tracking-tight text-primary dark:text-white">
          Review edit to {edit.program.name}
        </h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Submitted by{" "}
          <span className="font-medium">{submitter?.name ?? "Unknown"}</span>
          {submitter?.email ? ` (${submitter.email})` : ""} on{" "}
          {new Date(edit.createdAt).toLocaleDateString()}
        </p>
        <Link
          href={`/programs/${edit.program.slug}`}
          className="mt-1 inline-block text-sm text-amber-700 hover:underline dark:text-amber-400"
        >
          View current program
        </Link>
      </div>

      {edit.fieldDecisions.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">
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
        />
      )}
    </div>
  );
}
