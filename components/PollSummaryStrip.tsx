import Link from "next/link";
import Card from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import { meanToPercent, formatStarsMean } from "@/lib/pollFormat";
import DescriptiveQuestionCell from "@/components/polls/DescriptiveQuestionCell";
import type { PollSummaryDTO, PollSummaryQuestionDTO, PollSummaryBucketDTO } from "@/lib/pollShared";

/** Six-slot categorical palette for question-group (bucket) identity in the results
 * grid -- CSS custom properties defined in app/globals.css (both light and dark),
 * kept deliberately separate from the info/success/warning/danger tokens (those carry
 * status meaning elsewhere; reusing them here would make a bucket's color read as
 * "good"/"bad"). Assigned by each bucket's position in `summary.buckets` -- fixed
 * order, never cycled; a 7th+ bucket falls back to neutral rather than repeating a
 * hue. Referenced via inline style (not Tailwind classes) since the color is
 * data-driven and a dynamically-built class name wouldn't survive Tailwind's static
 * content scan. */
const BUCKET_COLOR_VARS = [
  "--poll-bucket-1",
  "--poll-bucket-2",
  "--poll-bucket-3",
  "--poll-bucket-4",
  "--poll-bucket-5",
  "--poll-bucket-6",
] as const;

function bucketColorVar(bucketId: string | null, buckets: PollSummaryBucketDTO[]): string | null {
  if (!bucketId) return null;
  const index = buckets.findIndex((b) => b.id === bucketId);
  if (index < 0 || index >= BUCKET_COLOR_VARS.length) return null;
  return `var(${BUCKET_COLOR_VARS[index]})`;
}

/** One question's result cell in the results grid. EVALUATIVE reads as a grade (star +
 * mean, bucket-tinted fill) -- higher is better. DESCRIPTIVE never shows a star or a
 * graded fill -- see DescriptiveQuestionCell, which defaults to the bare "x.x / 5"
 * number with a per-question toggle to a floor/ceil words track, so the result reads
 * as "where this program sits on a spectrum" rather than a score. Mean text always
 * stays in the ordinary foreground ink, never the bucket color -- identity is carried
 * by the circle/marker, not by tinting the number itself. */
function QuestionCell({ question, colorVar }: { question: PollSummaryQuestionDTO; colorVar: string | null }) {
  const { text, mean, count, scaleType, labels } = question;

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border p-3 text-center">
      <p className="text-xs font-medium text-foreground">{text}</p>
      {scaleType === "DESCRIPTIVE" ? (
        <DescriptiveQuestionCell mean={mean} count={count} labels={labels} colorVar={colorVar} />
      ) : (
        <>
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold text-foreground sm:h-20 sm:w-20"
            style={{
              borderColor: colorVar ?? "var(--border)",
              backgroundColor: colorVar
                ? `color-mix(in srgb, ${colorVar} 14%, var(--surface))`
                : "var(--surface-muted)",
            }}
          >
            {mean !== null ? `${formatStarsMean(mean)}★` : "---"}
          </div>
          <span className="text-[10px] text-muted">n={count}</span>
        </>
      )}
    </div>
  );
}

/**
 * Server component -- props are the aggregate PollSummaryDTO only, never a raw
 * PollResponse/answer/email/ipHash. Renders one of four states (see build spec's copy
 * table): be_first, collecting (with a live progress bar), under_review, or the
 * published score. `summary.counted` is COUNTED-only (not COUNTED+verified -- see
 * lib/pollResults.ts) so the copy here says "rating(s)", not "verified rating(s)".
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
      Math.round((summary.counted / summary.minResponsesToPublish) * 100)
    );
    return (
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-foreground">
            {summary.placeholderOverride ??
              `Ratings unlock at ${summary.minResponsesToPublish} responses — ${summary.counted} so far`}
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

  // Grouped by bucket, in summary.buckets' order (Core/General first, then extras --
  // see getProgramPollSummary). A question whose bucketId doesn't match any known
  // bucket (only possible when a program has no Core bucket at all) falls into a
  // trailing "Other" group rather than silently vanishing from the results.
  const groupedBucketIds = new Set(summary.buckets.map((b) => b.id));
  const ungroupedQuestions = otherQuestions.filter((q) => !q.bucketId || !groupedBucketIds.has(q.bucketId));

  return (
    <Card className="flex flex-col gap-5 p-4">
      {/* Overall is the headline this block leads with -- gold-tinted hero card,
          set apart from the plain bucket-group cards below (per frontend-design:
          spend the one visual accent on the thing that's actually the thesis). */}
      <div
        className="flex flex-wrap items-center gap-6 rounded-xl border p-4"
        style={{
          background: "color-mix(in srgb, var(--accent) 12%, var(--surface))",
          borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))",
        }}
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Overall rating</p>
          <p className="font-serif text-4xl font-semibold text-foreground sm:text-5xl">{scoreText}</p>
          <p className="text-sm text-muted">
            {summary.counted} rating{summary.counted === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex min-w-[180px] flex-1 flex-col gap-1">
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
        <Link
          href={`/rate/${programSlug}`}
          className={buttonVariants({ variant: "primary", size: "sm", className: "ml-auto shrink-0" })}
        >
          Rate this program
        </Link>
      </div>

      {otherQuestions.length > 0 && (
        <div className="flex flex-col gap-5">
          {summary.buckets.map((bucket) => {
            const bucketQuestions = otherQuestions.filter((q) => q.bucketId === bucket.id);
            if (bucketQuestions.length === 0) return null;
            const colorVar = bucketColorVar(bucket.id, summary.buckets);
            return (
              <div key={bucket.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="shrink-0 text-sm font-medium text-foreground">{bucket.name}</span>
                  <span
                    className="h-0.5 flex-1 rounded-full"
                    style={{ backgroundColor: colorVar ?? "var(--border)" }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {bucketQuestions.map((q) => (
                    <QuestionCell key={q.key} question={q} colorVar={colorVar} />
                  ))}
                </div>
              </div>
            );
          })}

          {ungroupedQuestions.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-sm font-medium text-foreground">Other</span>
                <span className="h-0.5 flex-1 rounded-full bg-border" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ungroupedQuestions.map((q) => (
                  <QuestionCell key={q.key} question={q} colorVar={null} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
