import { SignInButton, Show } from "@clerk/nextjs";
import { getCurrentRole } from "@/lib/roles";
import ProgramForm from "@/components/ProgramForm";

export default async function NewProgramPage() {
  const role = await getCurrentRole();
  const isModerator = role === "moderator" || role === "admin";

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Add a Program
      </h1>
      {!isModerator && (
        <p className="mb-6 text-sm text-black/60 dark:text-white/60">
          Your submission will be reviewed by a moderator before it appears
          publicly.
        </p>
      )}
      <Show
        when="signed-in"
        fallback={
          <SignInButton mode="modal">
            <button className="rounded-lg border border-black/10 px-4 py-1.5 text-sm hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]">
              Sign in to add a program
            </button>
          </SignInButton>
        }
      >
        <ProgramForm />
      </Show>
    </div>
  );
}
