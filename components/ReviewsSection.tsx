import { SignInButton, Show } from "@clerk/nextjs";
import ReviewForm from "@/components/ReviewForm";
import { buttonVariants } from "@/components/ui/Button";
import type { ProgramReviewsSummaryDTO } from "@/lib/pollResults";

/** 0 is the "Earlier" sentinel used by RateForm's year-attended dropdown -- see
 * yearAttendedOptions in lib/pollShared.ts. */
function yearAttendedLabel(yearAttended: number | null): string | null {
  if (yearAttended === null) return null;
  return yearAttended === 0 ? "Attended earlier" : `Attended ${yearAttended}`;
}

/**
 * The program page's one unified Reviews section -- approved poll reviews (grouped by
 * question, from the /rate flow) and approved standalone written reviews (the "just
 * write a review" box, no poll required) rendered together, both individually
 * moderated. `summary` is the pre-gated, pre-fetched ProgramReviewsSummaryDTO from
 * lib/pollResults.ts's getProgramReviewsSummary -- empty for both when the kill switch
 * is on or this program's resultsVisible is off, in which case this renders just the
 * heading and the submit box (capture stays open even when display is gated, same
 * `pollLinkPublic` vs `resultsVisible` split as the poll link). Each standalone review
 * shows its star rating, text, and reviewer name -- or "Anonymous" when the writer
 * chose to post anonymously. Poll reviews show only text + year attended (if given),
 * same anonymous-by-design posture as always. No moderator delete control here --
 * moderation happens exclusively through /admin/polls/reviews now, one queue for both
 * review types.
 */
export default function ReviewsSection({
  programId,
  summary,
}: {
  programId: string;
  summary: ProgramReviewsSummaryDTO;
}) {
  const hasContent = summary.pollGroups.length > 0 || summary.standaloneReviews.length > 0;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">Reviews</h2>

      {hasContent && (
        <div className="flex flex-col gap-6">
          {summary.pollGroups.map((group) => (
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

          {summary.standaloneReviews.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">General reviews</h3>
              <div className="flex flex-col gap-3">
                {summary.standaloneReviews.map((review) => (
                  <div key={review.id} className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-accent">
                        {"★".repeat(review.rating)}
                        {"☆".repeat(5 - review.rating)}
                      </span>
                      <span className="font-medium text-foreground">{review.reviewerName ?? "Anonymous"}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{review.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Show
        when="signed-in"
        fallback={
          <SignInButton mode="modal">
            <button className={buttonVariants({ variant: "secondary" })}>Sign in to leave a review</button>
          </SignInButton>
        }
      >
        <ReviewForm programId={programId} />
      </Show>
    </section>
  );
}
