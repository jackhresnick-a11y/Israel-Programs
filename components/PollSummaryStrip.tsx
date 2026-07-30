import Link from "next/link";
import Card from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import DescriptiveTrack from "@/components/polls/DescriptiveTrack";
import RatingRing from "@/components/polls/RatingRing";
import BestForStrip from "@/components/polls/BestForStrip";
import { deriveCtaLayout } from "@/lib/contactOptIn";
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

/** One question's result block, keyed off `scaleType` -- stacked vertically, never
 * side-by-side, so two questions can never collide regardless of screen width.
 * EVALUATIVE reads as a grade (a proportional ring, higher is better; see RatingRing).
 * DESCRIPTIVE never shows a ring or a star (those imply good/bad, wrong for a neutral
 * spectrum) -- it renders as a labeled spectrum track instead (see DescriptiveTrack).
 * Below `minResponsesToPublish` (the program's own reactivated ProgramPollConfig field,
 * default 7 -- see lib/pollShared.ts's PollSummaryDTO doc comment), neither renders --
 * each question publishes independently once IT crosses this bar, so the same grid can
 * show a mix of published and "not enough yet" questions side by side. Deliberately a
 * different, higher bar than lib/pollBestFor.ts's own MIN_RESPONSES_PER_QUESTION (=3),
 * which only gates Best-For-strip eligibility -- a different feature, untouched here. */
function QuestionBlock({
  question,
  colorVar,
  minResponsesToPublish,
}: {
  question: PollSummaryQuestionDTO;
  colorVar: string | null;
  minResponsesToPublish: number;
}) {
  const { text, mean, count, labels, scaleType } = question;

  if (count < minResponsesToPublish) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{text}</p>
        <p className="text-xs text-muted">Not enough responses yet.</p>
      </div>
    );
  }

  if (scaleType === "DESCRIPTIVE") {
    return <DescriptiveTrack text={text} mean={mean} count={count} labels={labels} colorVar={colorVar} />;
  }

  return <RatingRing text={text} mean={mean} count={count} labels={labels} colorVar={colorVar} />;
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
  publicPollLink,
  isModerator,
}: {
  summary: PollSummaryDTO;
  programSlug: string;
  // The tokened /rate/[slug]?ref=... link (see lib/pollConfig.ts's getPublicPollLink),
  // when the program has anonymous rating enabled -- lets a signed-out visitor rate
  // without hitting the sign-in wall. A signed-in visitor is unaffected either way: the
  // ref token is ignored once app/rate/[programSlug]/page.tsx sees a userId. Falls back
  // to the plain /rate/[slug] link (sign-in wall for signed-out visitors) when null.
  publicPollLink?: string | null;
  // Gates the "Editorial override" tell on BestForStrip -- a signed-out visitor sees
  // the override text with no indicator it's manual, same "does this look legit" bar as
  // every other admin-only affordance on this page.
  isModerator: boolean;
}) {
  const rateHref = publicPollLink ?? `/rate/${programSlug}`;
  const layout = deriveCtaLayout(summary);

  const groupedBucketIds = new Set(summary.buckets.map((b) => b.id));
  const ungroupedQuestions = summary.questions.filter((q) => !q.bucketId || !groupedBucketIds.has(q.bucketId));

  return (
    <div className="flex flex-col gap-4">
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

      {layout.showResults && summary.buckets.map((bucket) => {
        const bucketQuestions = summary.questions.filter((q) => q.bucketId === bucket.id);
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
                  <QuestionBlock question={q} colorVar={colorVar} minResponsesToPublish={summary.minResponsesToPublish} />
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {layout.showResults && ungroupedQuestions.length > 0 && (
        <Card className="flex flex-col gap-4 p-4">
          <span className="text-sm font-medium text-foreground">Other</span>
          <div className="flex flex-col divide-y divide-border">
            {ungroupedQuestions.map((q) => (
              <div key={q.key} className="py-4 first:pt-0 last:pb-0">
                <QuestionBlock question={q} colorVar={null} minResponsesToPublish={summary.minResponsesToPublish} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Second CTA instance, at the bottom of the results grid -- after reading the
          strip and per-question breakdown is the highest-intent moment to ask. Never
          shows the response-count line again (already said once, at the top). */}
      {layout.showBottomCta && <RateCta rateHref={rateHref} responseCount={summary.responseCount} showResponseCount={false} />}
    </div>
  );
}
