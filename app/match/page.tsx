import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import { getClientIpFromHeaders } from "@/lib/rateLimit";
import {
  loadActiveFlowQuestions,
  loadFlowClipData,
  resolveOrMintFlowSession,
  recordFlowResponses,
  buildFlowCoverageContext,
} from "@/lib/flowRun";
import { resolveFlow, parseAnswerState, withAnswer, buildMatchHref } from "@/lib/flowShared";
import FlowStep from "@/components/find/FlowStep";
import FlowAnswerSummary from "@/components/find/FlowAnswerSummary";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import { buttonVariants } from "@/components/ui/Button";
import Link from "next/link";

// Non-indexed while /match is flag-gated and still being content-authored (see
// /admin/flow/questions) -- unlike v1's /find, which is a stable, permanent tool.
export const metadata: Metadata = {
  title: "Find your program",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  s?: string;
  q?: string;
  a?: string;
  answer?: string;
  skip?: string;
  advance?: string;
}>;

export default async function MatchPage({ searchParams }: { searchParams: SearchParams }) {
  const [role, flag] = await Promise.all([getCurrentRole(), getSiteContent("findV2Enabled")]);
  if (flag !== "true" && role !== "admin") notFound();

  const { s, q, a, answer, skip, advance } = await searchParams;

  // NODE_ENV, not VERCEL_ENV: this repo's .env.local carries a stale
  // VERCEL_ENV="production" (leftover from a prior `vercel env pull`), which would
  // silently defeat a VERCEL_ENV-based check in local dev -- verified live against a
  // Neon branch, see the /find v2 section of CLAUDE.md. NODE_ENV is already the
  // established env/prod split elsewhere in this codebase (lib/prisma.ts,
  // lib/pollIntegrity.ts, lib/siteUrl.ts).
  const isTest = process.env.NODE_ENV !== "production";
  const ip = getClientIpFromHeaders(await headers());
  const sessionId = await resolveOrMintFlowSession(s, isTest, ip);
  if (sessionId === null) {
    return (
      <PageContainer width="narrow">
        <PageHeader title="Too many requests" description="Please wait a few minutes and try again." />
      </PageContainer>
    );
  }
  if (sessionId !== s) {
    const params = new URLSearchParams();
    params.set("s", sessionId);
    if (a) params.set("a", a);
    if (q) params.set("q", q);
    redirect(`/match?${params.toString()}`);
  }

  const [questions, clipData, coverage] = await Promise.all([
    loadActiveFlowQuestions(),
    loadFlowClipData(),
    buildFlowCoverageContext(),
  ]);
  const rawState = parseAnswerState(a);

  // A form submission (Continue or Skip) always carries `q` plus one of
  // answer/skip/advance -- fold it into state and let the resolver pick whatever
  // comes next, then redirect to the canonical URL for that question. This is the
  // ONE place an answer is ever written into state. `advance` (Continue's own
  // name/value, set even when there's no radio to check) is what makes an
  // interstitial's Continue distinguishable from a plain reload of the same URL --
  // without it, that click would produce a query string with no answer/skip param
  // at all, indistinguishable from just landing on the page.
  if (q && (answer !== undefined || skip === "1" || advance === "1")) {
    const value: string[] | null = skip === "1" ? null : answer ? [answer] : [];
    const nextRawState = withAnswer(rawState, q, value);
    const resolved = resolveFlow(questions, nextRawState, null, coverage);
    recordFlowResponses(sessionId, questions, resolved.state, clipData, resolved.conditionAnswers);
    redirect(buildMatchHref("/match", resolved.current?.key ?? null, resolved.state, sessionId));
  }

  const resolved = resolveFlow(questions, rawState, q ?? null, coverage);
  recordFlowResponses(sessionId, questions, resolved.state, clipData, resolved.conditionAnswers);

  if (!resolved.current) {
    const resultHref = buildMatchHref("/match/results", null, resolved.state, sessionId);
    return (
      <PageContainer width="narrow">
        <PageHeader title="Ready to see your matches?" description="Review what you told us, or go back and change anything." />
        <FlowAnswerSummary visible={resolved.visible} state={resolved.state} sessionId={sessionId} />
        <div className="flex flex-wrap items-center gap-3">
          {resolved.prevKey && (
            <Link
              href={buildMatchHref("/match", resolved.prevKey, resolved.state, sessionId)}
              prefetch={false}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Back
            </Link>
          )}
          <form method="POST" action={`/api/match/sessions/${sessionId}/submit`} className="ml-auto">
            <input type="hidden" name="resultHref" value={resultHref} />
            <button type="submit" className={buttonVariants({ variant: "primary", size: "sm" })}>
              See my matches
            </button>
          </form>
        </div>
      </PageContainer>
    );
  }

  const stepNumber = resolved.visible.findIndex((question) => question.key === resolved.current!.key) + 1;
  const currentTriggers = clipData.triggers.filter((t) => t.questionId === resolved.current!.id);

  return (
    <FlowStep
      sessionId={sessionId}
      question={resolved.current}
      options={resolved.visibleOptions}
      state={resolved.state}
      prevKey={resolved.prevKey}
      stepNumber={stepNumber}
      totalSteps={resolved.visible.length}
      triggers={currentTriggers}
      videosById={clipData.videosById}
      conditionAnswers={resolved.conditionAnswers}
    />
  );
}
