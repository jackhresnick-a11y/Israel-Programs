import { notFound, redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { getProgramBySlug } from "@/lib/programs";
import ProgramForm from "@/components/ProgramForm";

export default async function EditProgramPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const role = await getCurrentRole();
  if (role !== "moderator" && role !== "admin") {
    redirect("/programs");
  }

  const { slug } = await params;
  const program = await getProgramBySlug(slug);
  if (!program) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Edit {program.name}
      </h1>
      <ProgramForm
        initial={{
          id: program.id,
          name: program.name,
          description: program.description,
          organization: program.organization ?? "",
          location: program.location ?? "",
          durationType: program.durationType,
          durationText: program.durationText ?? "",
          cost: program.cost ?? "",
          signupInstructions: program.signupInstructions ?? "",
          signupUrl: program.signupUrl ?? "",
          contactEmail: program.contactEmail ?? "",
          contactPhone: program.contactPhone ?? "",
          contactWebsite: program.contactWebsite ?? "",
          tags: program.tags.map((t) => t.name).join(", "),
          logoUrl: program.logoUrl,
        }}
      />
    </div>
  );
}
