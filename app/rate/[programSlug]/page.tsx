import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getProgramForRating } from "@/lib/programs";
import { getQuestionsForProgram } from "@/lib/pollConfig";
import { getExistingSignedInResponse } from "@/lib/pollResponses";
import { validateReferrerToken } from "@/lib/pollTokens";
import RateForm from "@/components/polls/RateForm";
import PageContainer from "@/components/ui/PageContainer";
import Card from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ programSlug: string }>;
}): Promise<Metadata> {
  const { programSlug } = await params;
  const program = await getProgramForRating(programSlug);
  return {
    title: program ? `Rate ${program.name}` : "Rate this program",
    // Public but unlisted -- reachable via a direct link or the program page's "Rate
    // this program" button, never surfaced in search, same posture as app/s/[token].
    robots: { index: false, follow: false },
  };
}

export default async function RateProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ programSlug: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { programSlug } = await params;
  const { ref } = await searchParams;
  const program = await getProgramForRating(programSlug);
  if (!program || program.status !== "PUBLISHED") notFound();

  const { userId } = await auth();

  if (!userId) {
    // Signed out + a referrer token that resolves to this program (even a
    // revoked/expired/over-cap one -- those are accepted-and-flagged, never rejected):
    // no login wall, no email field, straight to the anonymous form. Signed out with no
    // token, or a token that doesn't resolve at all, falls through to the sign-in CTA --
    // the anonymous link-path stays exclusive to links an admin actually minted.
    const validation = ref ? await validateReferrerToken(ref) : null;
    if (validation?.ok && validation.token.programId === program.id) {
      const { core, extras } = await getQuestionsForProgram(program.id);
      return (
        <PageContainer width="narrow" className="gap-6">
          <div className="border-l-4 border-accent pl-4">
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Rate {program.name}
            </h1>
            <p className="mt-1 text-sm text-muted">Five quick questions -- takes about a minute.</p>
          </div>
          {core.length === 0 ? (
            <p className="text-sm text-muted">Ratings aren&apos;t set up for this program yet.</p>
          ) : (
            <RateForm
              mode="anonymous"
              programId={program.id}
              programSlug={program.slug}
              programName={program.name}
              referrerToken={ref as string}
              questions={core}
              extras={extras}
            />
          )}
        </PageContainer>
      );
    }

    return (
      <PageContainer width="narrow" className="gap-6">
        <div className="border-l-4 border-accent pl-4">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Rate {program.name}
          </h1>
          <p className="mt-1 text-sm text-muted">Sign in to leave a rating for this program.</p>
        </div>
        <Card className="p-6 text-center">
          <Link href={`/sign-in?redirect_url=/rate/${program.slug}`} className={buttonVariants({ variant: "primary" })}>
            Sign in to rate
          </Link>
        </Card>
      </PageContainer>
    );
  }

  const [{ core }, existing] = await Promise.all([
    getQuestionsForProgram(program.id),
    getExistingSignedInResponse(program.id, userId),
  ]);

  const existingAnswers = existing
    ? Object.fromEntries(existing.answers.map((a) => [a.questionId, a.value]))
    : undefined;

  return (
    <PageContainer width="narrow" className="gap-6">
      <div className="border-l-4 border-accent pl-4">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Rate {program.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {existing ? "Update your rating below." : "Five quick questions -- takes about a minute."}
        </p>
      </div>
      {core.length === 0 ? (
        <p className="text-sm text-muted">Ratings aren&apos;t set up for this program yet.</p>
      ) : (
        <RateForm mode="signed-in" programId={program.id} questions={core} existingAnswers={existingAnswers} />
      )}
    </PageContainer>
  );
}
