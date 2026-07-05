import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, Show } from "@clerk/nextjs";
import { getCurrentRole } from "@/lib/roles";
import { getProgramBySlug } from "@/lib/programs";
import ProgramForm from "@/components/ProgramForm";

export default async function EditProgramPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [program, role, { userId }] = await Promise.all([
    getProgramBySlug(slug),
    getCurrentRole(),
    auth(),
  ]);
  if (!program) notFound();

  const isModerator = role === "moderator" || role === "admin";
  const isOwner = userId === program.createdById;
  if (program.status !== "PUBLISHED" && !isModerator && !isOwner) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Edit {program.name}
      </h1>
      {!isModerator && (
        <p className="mb-6 text-sm text-black/60 dark:text-white/60">
          Your changes will be reviewed by a moderator before they go live.
        </p>
      )}
      <Show
        when="signed-in"
        fallback={
          <SignInButton mode="modal">
            <button className="rounded-lg border border-black/10 px-4 py-1.5 text-sm hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]">
              Sign in to propose an edit
            </button>
          </SignInButton>
        }
      >
        <ProgramForm
          initial={{
            id: program.id,
            slug: program.slug,
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
      </Show>
    </div>
  );
}
