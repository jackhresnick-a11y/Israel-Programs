import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import { getDurationLabelMap } from "@/lib/duration";
import { loadActiveFlowQuestions, runMatchResults, type MatchProgram } from "@/lib/flowRun";
import { resolveFlow, parseAnswerState, withAnswer, buildMatchHref } from "@/lib/flowShared";
import type { ScoredProgram } from "@/lib/flowRank";
import FlowAnswerSummary from "@/components/find/FlowAnswerSummary";
import MatchBadge from "@/components/find/MatchBadge";
import ProgramCard from "@/components/ProgramCard";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import { buttonVariants } from "@/components/ui/Button";
import type { DurationType } from "@/app/generated/prisma/client";

// Personal, query-parameterized result set -- same posture as /saved/[id] and
// /rate/[programSlug], never indexed.
export const metadata: Metadata = {
  title: "Your matches",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ s?: string; a?: string }>;

function ResultsGrid({
  items,
  durationLabelMap,
}: {
  items: ScoredProgram<MatchProgram>[];
  durationLabelMap: Record<DurationType, string>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((scored) => (
        <ProgramCard
          key={scored.program.id}
          program={scored.program}
          durationLabelMap={durationLabelMap}
          action={<MatchBadge matched={scored.matchedCriteria} total={scored.totalCriteria} band={scored.band} />}
        />
      ))}
    </div>
  );
}

export default async function MatchResultsPage({ searchParams }: { searchParams: SearchParams }) {
  const [role, flag] = await Promise.all([getCurrentRole(), getSiteContent("findV2Enabled")]);
  if (flag !== "true" && role !== "admin") notFound();

  const { s, a } = await searchParams;

  const questions = await loadActiveFlowQuestions();
  const rawState = parseAnswerState(a);
  const resolved = resolveFlow(questions, rawState, null);

  const [results, durationLabelMap] = await Promise.all([
    runMatchResults(questions, resolved.state),
    getDurationLabelMap(),
  ]);

  const strong = results.scored.filter((r) => r.band === "strong");
  const partial = results.scored.filter((r) => r.band === "partial");
  const weak = results.scored.filter((r) => r.band === "weak");
  const unranked = results.scored.filter((r) => r.band === "unranked");
  const allUnranked = results.scored.length > 0 && unranked.length === results.scored.length;

  const backToFlowHref = buildMatchHref("/match", null, resolved.state, s);

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Your matches"
        description="Ranked by how much they line up with what you told us -- nothing is hidden, weaker matches just sort lower."
      />

      <FlowAnswerSummary visible={resolved.visible} state={resolved.state} sessionId={s ?? ""} />

      {results.scored.length === 0 && results.relaxations.length > 0 && (
        <div className="flex flex-col gap-3 rounded border border-border p-4">
          <p className="text-sm text-foreground">
            Nothing matches everything you picked. Relax one of these to see programs:
          </p>
          <div className="flex flex-wrap gap-2">
            {results.relaxations.map((relaxation) => (
              <Link
                key={relaxation.questionKey}
                href={buildMatchHref(
                  "/match/results",
                  null,
                  withAnswer(resolved.state, relaxation.questionKey, null),
                  s
                )}
                prefetch={false}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Allow {relaxation.label} → {relaxation.count} programs
              </Link>
            ))}
          </div>
        </div>
      )}

      {results.scored.length === 0 && results.relaxations.length === 0 && (
        <p className="text-sm text-muted">No published programs matched. Try going back and answering differently.</p>
      )}

      {allUnranked && (
        <>
          <p className="text-sm text-muted">
            Every question was skipped, so nothing here is ranked -- this is the full directory.{" "}
            <Link href={backToFlowHref} prefetch={false} className="text-accent-hover underline">
              Answer a few questions
            </Link>{" "}
            to narrow it down.
          </p>
          <ResultsGrid items={unranked} durationLabelMap={durationLabelMap} />
        </>
      )}

      {!allUnranked && strong.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Strong matches ({strong.length})
          </h2>
          <ResultsGrid items={strong} durationLabelMap={durationLabelMap} />
        </section>
      )}

      {!allUnranked && partial.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Partial matches ({partial.length})
          </h2>
          <p className="text-sm text-muted">These match some of what you said, not most of it. Worth a look anyway.</p>
          <ResultsGrid items={partial} durationLabelMap={durationLabelMap} />
        </section>
      )}

      {!allUnranked && weak.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer font-serif text-lg font-semibold tracking-tight text-foreground">
            Everything else ({weak.length})
          </summary>
          <p className="text-sm text-muted">
            {weak.length} more programs we didn&rsquo;t rule out -- open if you want the full directory.
          </p>
          <div className="mt-2">
            <ResultsGrid items={weak} durationLabelMap={durationLabelMap} />
          </div>
        </details>
      )}
    </PageContainer>
  );
}
