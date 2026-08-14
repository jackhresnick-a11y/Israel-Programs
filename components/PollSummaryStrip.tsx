"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";
import DescriptiveTrack from "@/components/polls/DescriptiveTrack";
import RatingRing from "@/components/polls/RatingRing";
import BestForStrip from "@/components/polls/BestForStrip";
import { deriveCtaLayout } from "@/lib/contactOptIn";
import { useIsModerator } from "@/lib/useModeratorRole";
import type { PollSummaryDTO, PollSummaryQuestionDTO, PollSummaryBucketDTO } from "@/lib/pollShared";

/** Ten-slot categorical palette for question-group (bucket) identity in the results
 * grid -- CSS custom properties defined in app/globals.css, kept deliberately separate
 * from the info/success/warning/danger tokens (those carry status meaning elsewhere;
 * reusing them here would make a bucket's color read as "good"/"bad"). Assigned by
 * `bucket.order` (QuestionBucket.order -- a global, admin-assigned, stable field), not
 * by a bucket's position within this one program's resolved `summary.buckets` list --
 * that's what makes the same bucket render the same color on every program it appears
 * on. A newly created bucket gets `order = max(order)+1` (lib/pollQuestions.ts's
 * createBucket), so it automatically draws the next ramp color rather than reusing or
 * inventing one; an 11th+ bucket wraps via modulo rather than falling back to neutral.
 * Referenced via inline style (not Tailwind classes) since the color is data-driven and
 * a dynamically-built class name wouldn't survive Tailwind's static content scan. */
const BUCKET_COLOR_VARS = [
  "--poll-bucket-1",
  "--poll-bucket-2",
  "--poll-bucket-3",
  "--poll-bucket-4",
  "--poll-bucket-5",
  "--poll-bucket-6",
  "--poll-bucket-7",
  "--poll-bucket-8",
  "--poll-bucket-9",
  "--poll-bucket-10",
] as const;

function bucketColorVar(bucketId: string | null, buckets: PollSummaryBucketDTO[]): string | null {
  if (!bucketId) return null;
  const bucket = buckets.find((b) => b.id === bucketId);
  if (!bucket) return null;
  const index = ((bucket.order % BUCKET_COLOR_VARS.length) + BUCKET_COLOR_VARS.length) % BUCKET_COLOR_VARS.length;
  return `var(${BUCKET_COLOR_VARS[index]})`;
}

/** A question is worth rendering something for when either it's already published, or
 * it's still `isCurrent` (part of the program's live poll set, so an unpublished count
 * can still cross the bar later). An unpublished, non-current (orphaned/retired)
 * question can never publish -- its count is frozen -- so it renders nothing anywhere:
 * not a chart, not a "not enough responses yet" placeholder that would never resolve.
 * Shared between QuestionBlock (per-question) and PollSummaryStrip's section build
 * (per-bucket, to decide whether a bucket has anything to show at all). */
function isRenderable(question: PollSummaryQuestionDTO): boolean {
  return question.published || question.isCurrent;
}

/** One question's result block, keyed off `scaleType` -- stacked vertically, never
 * side-by-side, so two questions can never collide regardless of screen width.
 * EVALUATIVE reads as a grade (a proportional ring, higher is better; see RatingRing).
 * DESCRIPTIVE never shows a ring or a star (those imply good/bad, wrong for a neutral
 * spectrum) -- it renders as a labeled spectrum track instead (see DescriptiveTrack).
 * `question.published` (computed server-side in getProgramPollSummary: count >=
 * minResponsesToPublish OR grandfathered) gates both -- each question publishes
 * independently once IT crosses the bar (or was already showing before the bar existed),
 * so the same grid can show a mix of published and "not enough yet" questions side by
 * side. Deliberately a different, higher bar than lib/pollBestFor.ts's own
 * MIN_RESPONSES_PER_QUESTION (=3), which only gates Best-For-strip eligibility -- a
 * different feature, untouched here.
 *
 * An unpublished, non-current question renders nothing (see isRenderable) rather than
 * "Not enough responses yet." -- that placeholder promises the reader more responses
 * could still arrive, which is false for an orphaned question the rating form no longer
 * serves. PollSummaryStrip's section build already filters these out before they reach
 * here; this is the same rule applied at the single-question level, in case a caller
 * ever passes an unfiltered list. */
function QuestionBlock({
  question,
  colorVar,
  programName,
}: {
  question: PollSummaryQuestionDTO;
  colorVar: string | null;
  programName: string;
}) {
  const { text, mean, count, labels, scaleType, published, isCurrent } = question;

  if (!published) {
    if (!isCurrent) return null;
    return (
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">{text}</h3>
        <p className="text-xs text-muted">Not enough responses yet.</p>
      </div>
    );
  }

  if (scaleType === "DESCRIPTIVE") {
    return <DescriptiveTrack text={text} programName={programName} mean={mean} count={count} labels={labels} colorVar={colorVar} />;
  }

  return <RatingRing text={text} programName={programName} mean={mean} count={count} labels={labels} colorVar={colorVar} />;
}

/** One collapsible bucket group -- a plain bucket (isCore/manual/rule-attached) or the
 * synthetic "Other" pseudo-bucket for orphaned/unmatched questions (see
 * PollSummaryStrip's `sections` build below). `key` doubles as the React key and the
 * open-state map key. */
type BucketSectionData = {
  key: string;
  name: string;
  description: string | null;
  colorVar: string | null;
  questions: PollSummaryQuestionDTO[];
  defaultOpen: boolean;
  retired: boolean;
};

/** One collapsed-by-default results row. The collapsed header carries identity only --
 * dot, name, description, a question count -- and deliberately no score/average/rating,
 * so the summary layer can never be read as a ranking (see "There is no aggregate score"
 * in CLAUDE.md). The panel is always rendered and toggled via the `hidden` attribute
 * rather than conditionally mounted: RatingRing/DescriptiveTrack each render a fixed
 * extractability sentence (lib/pollSentences.ts) into the server-rendered HTML for AI/
 * search extraction, and unmounting a collapsed panel would delete that content from the
 * page source, not just hide it visually. */
function BucketSection({
  section,
  programName,
  isOpen,
  onToggle,
}: {
  section: BucketSectionData;
  programName: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const panelId = `poll-bucket-panel-${section.key}`;
  const questionCount = section.questions.length;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex w-full min-h-11 items-center gap-3 text-left"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: section.colorVar ?? "var(--border)" }}
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{section.name}</span>
            {section.retired && <Badge tone="neutral">Retired</Badge>}
          </span>
          {section.description && <span className="block text-xs text-muted">{section.description}</span>}
          <span className="text-xs text-accent-hover">Expand to see results</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted">
            {questionCount} question{questionCount === 1 ? "" : "s"}
          </span>
          <ChevronDown width={16} height={16} strokeWidth={1.5} aria-hidden="true" className={isOpen ? "rotate-180" : undefined} />
        </span>
      </button>

      <div id={panelId} hidden={!isOpen} className="flex flex-col divide-y divide-border">
        {section.questions.map((q) => (
          <div key={q.key} className="py-4 first:pt-0 last:pb-0">
            <QuestionBlock question={q} colorVar={section.colorVar} programName={programName} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** The primary "Rate this program" button plus its optional social-proof line -- one
 * component so the top and bottom instances can never drift in label, styling, or the
 * count's wording. Reuses `buttonVariants` at the "primary" tone (no new color/variant)
 * so this reads as the single most prominent action in the region without competing
 * with page-level navigation, which never uses the primary tone. Full-width on mobile
 * (a thumb-width target at 390px), auto-width from `sm:` up. */
function RateCta({
  rateHref,
  responseCount,
  showResponseCount,
}: {
  rateHref: string;
  responseCount: number;
  showResponseCount: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <Link href={rateHref} className={buttonVariants({ variant: "primary", className: "w-full sm:w-auto" })}>
        Rate this program
      </Link>
      {showResponseCount && (
        <p className="text-xs text-muted">
          {responseCount === 1 ? "1 person has rated this program." : `${responseCount} people have rated this program.`}
        </p>
      )}
    </div>
  );
}

/**
 * Server component -- props are the aggregate PollSummaryDTO only, never a raw
 * PollResponse/answer/email/ipHash. Deliberately carries no aggregate/overall scored
 * number anywhere: leads with the fit-phrased BestForStrip (see that component), then
 * the bucket-grouped question grid below it, unchanged from before except each
 * individual question now suppresses itself under the program's own minResponsesToPublish
 * (see QuestionBlock) rather than the whole strip waiting on one global publish threshold.
 *
 * The primary "Rate this program" button (see RateCta) is deliberately NOT gated on
 * `summary.visible` -- an admin can leave a program's results hidden ("ships dark")
 * while alumni are still meant to be able to submit ratings, and driving the FIRST
 * responses is exactly when a program has no visible results yet. A second CTA instance
 * renders at the bottom of the results grid (after someone has read the strip and the
 * per-question breakdown is the highest-intent moment to ask) -- gated on `visible`
 * since there's no "bottom of the grid" when there's no grid. `deriveCtaLayout`
 * (lib/contactOptIn.ts) is the single place both instances' visibility and the
 * social-proof line's threshold are decided, so they can't drift apart.
 */
export default function PollSummaryStrip({
  summary,
  programSlug,
  programName,
  publicPollLink,
}: {
  summary: PollSummaryDTO;
  programSlug: string;
  // Feeds the per-question extractability sentences (lib/pollSentences.ts) rendered
  // inside RatingRing/DescriptiveTrack -- the sentence names the program by its real
  // display name, never the slug.
  programName: string;
  // The tokened /rate/[slug]?ref=... link (see lib/pollConfig.ts's getPublicPollLink),
  // when the program has anonymous rating enabled -- lets a signed-out visitor rate
  // without hitting the sign-in wall. A signed-in visitor is unaffected either way: the
  // ref token is ignored once app/rate/[programSlug]/page.tsx sees a userId. Falls back
  // to the plain /rate/[slug] link (sign-in wall for signed-out visitors) when null.
  publicPollLink?: string | null;
}) {
  // Gates the "Editorial override" tell on BestForStrip -- a signed-out visitor sees
  // the override text with no indicator it's manual, same "does this look legit" bar as
  // every other admin-only affordance on this page.
  const isModerator = useIsModerator();
  const rateHref = publicPollLink ?? `/rate/${programSlug}`;
  const layout = deriveCtaLayout(summary);

  // Excludes questions isRenderable would render nothing for (unpublished + orphaned --
  // see isRenderable's doc comment) up front, so a bucket/section built from this list
  // never ends up with a "N questions" count that overcounts blank rows, and a bucket
  // whose every question is a permanent dead end is caught by the empty-list check below
  // instead of rendering an expandable row with nothing behind it.
  const visibleQuestions = summary.questions.filter(isRenderable);

  const groupedBucketIds = new Set(summary.buckets.map((b) => b.id));
  const ungroupedQuestions = visibleQuestions.filter((q) => !q.bucketId || !groupedBucketIds.has(q.bucketId));

  // One row per bucket, plus a synthetic "Other" row for any question whose bucket
  // didn't resolve (a dead soft-ref, or a retired bucket the results grid never lists --
  // see lib/pollResults.ts). General (the isCore bucket) is the only section open by
  // default; a retired bucket and "Other" always start closed, per the collapse spec.
  // A bucket with zero renderable questions -- e.g. a retired bucket whose only question
  // never crossed the publish threshold before being retired -- is omitted entirely
  // rather than rendering an empty, expandable dead end.
  const sections: BucketSectionData[] = [
    ...summary.buckets
      .map((bucket): BucketSectionData | null => {
        const bucketQuestions = visibleQuestions.filter((q) => q.bucketId === bucket.id);
        if (bucketQuestions.length === 0) return null;
        return {
          key: bucket.id,
          name: bucket.name,
          description: bucket.description,
          colorVar: bucketColorVar(bucket.id, summary.buckets),
          questions: bucketQuestions,
          defaultOpen: bucket.isCore && !bucket.retired,
          retired: bucket.retired,
        };
      })
      .filter((section): section is BucketSectionData => section !== null),
    ...(ungroupedQuestions.length > 0
      ? [
          {
            key: "__ungrouped",
            name: "Other",
            description: null,
            colorVar: null,
            questions: ungroupedQuestions,
            defaultOpen: false,
            retired: false,
          },
        ]
      : []),
  ];

  // Lazily seeded from each section's own defaultOpen -- runs once per mount, same
  // idiom as components/polls/QuestionWithReview.tsx's commentOpen.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((section) => [section.key, section.defaultOpen]))
  );
  const allOpen = sections.length > 0 && sections.every((section) => open[section.key] ?? section.defaultOpen);
  function toggleAll() {
    const next = !allOpen;
    setOpen(Object.fromEntries(sections.map((section) => [section.key, next])));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="ratings"
          tabIndex={-1}
          className="jump-target-offset font-serif text-lg font-semibold tracking-tight text-foreground"
        >
          Poll results
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {layout.showResults && sections.length >= 2 && (
            <button type="button" onClick={toggleAll} className="text-xs font-medium text-accent-hover underline">
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
          <Link href="/methodology" className="text-xs text-accent-hover underline">
            How these results are collected →
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {layout.showResults && (
          <BestForStrip
            phrases={summary.bestForPhrases}
            editorialBestFor={summary.editorialBestFor}
            varianceNote={summary.varianceNote}
            isModerator={isModerator}
          />
        )}
        <RateCta rateHref={rateHref} responseCount={summary.responseCount} showResponseCount={layout.showResponseCount} />
      </div>

      {layout.showResults &&
        sections.map((section) => (
          <BucketSection
            key={section.key}
            section={section}
            programName={programName}
            isOpen={open[section.key] ?? section.defaultOpen}
            onToggle={() =>
              setOpen((prev) => ({ ...prev, [section.key]: !(prev[section.key] ?? section.defaultOpen) }))
            }
          />
        ))}

      {/* Second CTA instance, at the bottom of the results grid -- after reading the
          strip and per-question breakdown is the highest-intent moment to ask. Never
          shows the response-count line again (already said once, at the top). */}
      {layout.showBottomCta && <RateCta rateHref={rateHref} responseCount={summary.responseCount} showResponseCount={false} />}
    </div>
  );
}
