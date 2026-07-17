import type { PollReviewGroupDTO } from "@/lib/pollShared";

/** 0 is the "Earlier" sentinel used by RateForm's year-attended dropdown -- see
 * yearAttendedOptions in lib/pollShared.ts. */
function yearAttendedLabel(yearAttended: number | null): string | null {
  if (yearAttended === null) return null;
  return yearAttended === 0 ? "Attended earlier" : `Attended ${yearAttended}`;
}

/**
 * Server component -- props are the pre-grouped, pre-gated PollReviewGroupDTO[] from
 * lib/pollResults.ts's getProgramReviewsSummary, never a raw PollReview row. Renders
 * nothing at all when there are zero approved reviews (no placeholder, no empty-state
 * copy) -- distinct from PollSummaryStrip, which always renders something. Each review
 * shows only its text and, if given, the year attended -- no name, no initials, no
 * avatar, no precise date.
 */
export default function PollReviewsSection({ groups }: { groups: PollReviewGroupDTO[] }) {
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">Alumni reviews</h2>
      {groups.map((group) => (
        <div key={group.questionKey} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">{group.questionText}</h3>
          <div className="flex flex-col gap-3">
            {group.reviews.map((review, i) => {
              const yearLabel = yearAttendedLabel(review.yearAttended);
              return (
                <div key={i} className="rounded-xl border border-border bg-surface p-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{review.text}</p>
                  {yearLabel && <p className="mt-2 text-xs text-muted">{yearLabel}</p>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
