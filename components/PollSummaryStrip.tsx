import Link from "next/link";
import Card from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import { meanToPercent, formatStarsMean } from "@/lib/pollFormat";
import DescriptiveTrack from "@/components/polls/DescriptiveTrack";
import RatingRing from "@/components/polls/RatingRing";
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

/** One question's result block, keyed off `scaleType` -- stacked vertically, never
 * side-by-side, so two questions can never collide regardless of screen width.
 * EVALUATIVE reads as a grade (a proportional ring, higher is better; see RatingRing).
 * DESCRIPTIVE never shows a ring or a star (those imply good/bad, wrong for a neutral
 * spectrum) -- it renders as a labeled spectrum track instead (see DescriptiveTrack). */
function QuestionBlock({ question, colorVar }: { question: PollSummaryQuestionDTO; colorVar: string | null }) {
  const { text, mean, count, labels, scaleType } = question;

  if (scaleType === "DESCRIPTIVE") {
    return <DescriptiveTrack text={text} mean={mean} count={count} labels={labels} colorVar={colorVar} />;
  }

  return <RatingRing text={text} mean={mean} count={count} labels={labels} colorVar={colorVar} />;
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
  publicPollLink,
}: {
  summary: PollSummaryDTO;
  programSlug: string;
  // The tokened /rate/[slug]?ref=... link (see lib/pollConfig.ts's getPublicPollLink),
  // when the program has anonymous rating enabled -- lets a signed-out visitor rate
  // without hitting the sign-in wall. A signed-in visitor is unaffected either way: the
  // ref token is ignored once app/rate/[programSlug]/page.tsx sees a userId. Falls back
  // to the plain /rate/[slug] link (sign-in wall for signed-out visitors) when null.
  publicPollLink?: string | null;
}) {
  const rateHref = publicPollLink ?? `/rate/${programSlug}`;

  if (summary.state === "be_first") {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-foreground">
          {summary.placeholderOverride ?? "Be the first to rate this program"}
        </p>
        <Link href={rateHref} className={buttonVariants({ variant: "primary", size: "sm" })}>
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
          <Link href={rateHref} className={buttonVariants({ variant: "primary", size: "sm" })}>
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
        <Link href={rateHref} className={buttonVariants({ variant: "primary", size: "sm" })}>
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
    <div className="flex flex-col gap-4">
      {/* Overall is the headline this block leads with -- gold-tinted hero card,
          set apart from the plain bucket-group cards below (per frontend-design:
          spend the one visual accent on the thing that's actually the thesis).
          Strictly vertical (score, then histogram, then CTA) so nothing can
          collide regardless of screen width. */}
      <Card
        className="flex flex-col gap-3 p-4"
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
        <Link
          href={rateHref}
          className={buttonVariants({ variant: "primary", size: "sm", className: "w-full sm:w-auto sm:self-start" })}
        >
          Rate this program
        </Link>
      </Card>

      {summary.buckets.map((bucket) => {
        const bucketQuestions = otherQuestions.filter((q) => q.bucketId === bucket.id);
        if (bucketQuestions.length === 0) return null;
        const colorVar = bucketColorVar(bucket.id, summary.buckets);
        return (
          <Card key={bucket.id} className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-3">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: colorVar ?? "var(--border)" }}
              />
              <span className="text-sm font-medium text-foreground">{bucket.name}</span>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {bucketQuestions.map((q) => (
                <div key={q.key} className="py-4 first:pt-0 last:pb-0">
                  <QuestionBlock question={q} colorVar={colorVar} />
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {ungroupedQuestions.length > 0 && (
        <Card className="flex flex-col gap-4 p-4">
          <span className="text-sm font-medium text-foreground">Other</span>
          <div className="flex flex-col divide-y divide-border">
            {ungroupedQuestions.map((q) => (
              <div key={q.key} className="py-4 first:pt-0 last:pb-0">
                <QuestionBlock question={q} colorVar={null} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
