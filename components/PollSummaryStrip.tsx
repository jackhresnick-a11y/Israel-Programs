import Link from "next/link";
import Card from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import { meanToPercent, formatStarsMean } from "@/lib/pollFormat";
import type { PollSummaryDTO } from "@/lib/pollShared";

/**
 * Server component -- props are the aggregate PollSummaryDTO only, never a raw
 * PollResponse/answer/email/ipHash. Renders one of four states (see build spec's copy
 * table): be_first, collecting (with a live progress bar), under_review, or the
 * published score. The word "verified" in the published copy is load-bearing per spec.
 */
export default function PollSummaryStrip({
  summary,
  programSlug,
}: {
  summary: PollSummaryDTO;
  programSlug: string;
}) {
  if (summary.state === "be_first") {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-foreground">
          {summary.placeholderOverride ?? "Be the first to rate this program"}
        </p>
        <Link href={`/rate/${programSlug}`} className={buttonVariants({ variant: "primary", size: "sm" })}>
          Rate this program
        </Link>
      </Card>
    );
  }

  if (summary.state === "collecting") {
    const progressPct = Math.min(
      100,
      Math.round((summary.countedVerified / summary.minResponsesToPublish) * 100)
    );
    return (
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-foreground">
            {summary.placeholderOverride ??
              `Ratings unlock at ${summary.minResponsesToPublish} responses — ${summary.countedVerified} so far`}
          </p>
          <Link href={`/rate/${programSlug}`} className={buttonVariants({ variant: "primary", size: "sm" })}>
            Rate this program
          </Link>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </Card>
    );
  }

  if (summary.state === "under_review") {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-foreground">{summary.placeholderOverride ?? "Ratings under review"}</p>
        <Link href={`/rate/${programSlug}`} className={buttonVariants({ variant: "primary", size: "sm" })}>
          Rate this program
        </Link>
      </Card>
    );
  }

  // Published: percent and stars are both derived from the one overallMean, so they
  // can never drift arithmetically apart from each other.
  const percent = summary.overallMean !== null ? meanToPercent(summary.overallMean) : null;
  const stars = summary.overallMean !== null ? formatStarsMean(summary.overallMean) : null;

  const scoreText =
    summary.displayFormat === "STARS"
      ? `${stars} ★`
      : summary.displayFormat === "PERCENT"
        ? `${percent}/100`
        : `${percent}/100 · ${stars} ★`;

  const maxCount = Math.max(1, ...summary.overallHistogram);
  const otherQuestions = summary.questions.filter((q) => q.key !== "overall");

  return (
    <Card className="flex flex-col gap-4 p-4">
      <p className="text-lg font-semibold text-foreground">
        {scoreText}{" "}
        <span className="text-sm font-normal text-muted">
          · {summary.countedVerified} verified rating{summary.countedVerified === 1 ? "" : "s"}
        </span>
      </p>

      <div className="flex flex-col gap-1">
        {summary.overallHistogram.map((count, i) => {
          const starCount = i + 1;
          const width = (count / maxCount) * 100;
          return (
            <div key={starCount} className="flex items-center gap-2 text-xs text-muted">
              <span className="w-3 text-right">{starCount}★</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
              </div>
              <span className="w-6 text-right">{count}</span>
            </div>
          );
        })}
      </div>

      {otherQuestions.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-accent-hover dark:text-accent">
            See all questions
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {otherQuestions.map((q) => (
              <div key={q.key} className="flex items-center justify-between gap-3 text-xs text-muted">
                <span>{q.text}</span>
                <span className="shrink-0">
                  {formatStarsMean(q.mean)} ★ ({q.count})
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
