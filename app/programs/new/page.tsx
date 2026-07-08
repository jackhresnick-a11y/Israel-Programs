import { SignInButton, Show } from "@clerk/nextjs";
import { getCurrentRole } from "@/lib/roles";
import { listAllTags } from "@/lib/programs";
import { listTagCategories } from "@/lib/tags";
import ProgramForm from "@/components/ProgramForm";
import PageContainer from "@/components/ui/PageContainer";
import { buttonVariants } from "@/components/ui/Button";

export default async function NewProgramPage() {
  const [role, allTags, categories] = await Promise.all([
    getCurrentRole(),
    listAllTags(),
    listTagCategories(),
  ]);
  const isModerator = role === "moderator" || role === "admin";

  return (
    <PageContainer width="narrow" className="gap-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Add a Program
        </h1>
        {!isModerator && (
          <p className="mt-2 text-sm text-muted">
            Your submission will be reviewed by a moderator before it appears
            publicly.
          </p>
        )}
      </div>
      <Show
        when="signed-in"
        fallback={
          <SignInButton mode="modal">
            <button className={buttonVariants({ variant: "secondary" })}>
              Sign in to add a program
            </button>
          </SignInButton>
        }
      >
        <ProgramForm allTags={allTags} categories={categories} />
      </Show>
    </PageContainer>
  );
}
