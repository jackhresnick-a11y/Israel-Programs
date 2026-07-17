import type { Metadata } from "next";
import Link from "next/link";
import { verifyPollResponse } from "@/lib/pollResponses";
import PageContainer from "@/components/ui/PageContainer";
import Card from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Confirm your rating",
  robots: { index: false, follow: false },
};

const FAILURE_COPY: Record<"invalid" | "expired" | "already_counted", { title: string; body: string }> = {
  invalid: {
    title: "This link isn't valid",
    body: "We couldn't find a rating matching this link -- the address may have been mistyped.",
  },
  expired: {
    title: "This link has expired",
    body:
      "Verification links are only valid for 7 days. Your rating is still on file, but it won't count toward the " +
      "public score unless you submit a new one and verify again.",
  },
  already_counted: {
    title: "Already counted",
    body: "This email has already verified a rating for this program -- no further action needed.",
  },
};

export default async function VerifyPollResponsePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token
    ? await verifyPollResponse(token)
    : ({ ok: false, reason: "invalid" } as const);

  if (result.ok) {
    return (
      <PageContainer width="narrow" className="gap-6">
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-lg font-semibold text-foreground">Thanks -- your rating is confirmed!</p>
          <p className="text-sm text-muted">It now counts toward this program&rsquo;s public score.</p>
          <Link href={`/programs/${result.programSlug}`} className={buttonVariants({ variant: "primary" })}>
            View the program
          </Link>
        </Card>
      </PageContainer>
    );
  }

  const copy = FAILURE_COPY[result.reason];
  return (
    <PageContainer width="narrow" className="gap-6">
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-lg font-semibold text-foreground">{copy.title}</p>
        <p className="text-sm text-muted">{copy.body}</p>
      </Card>
    </PageContainer>
  );
}
