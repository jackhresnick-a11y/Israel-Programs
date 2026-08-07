"use client";

import { SignInButton, Show } from "@clerk/nextjs";
import ReviewForm from "@/components/ReviewForm";
import { buttonVariants } from "@/components/ui/Button";
import StarRating from "@/components/ui/StarRating";
import type { ProgramReviewsSummaryDTO } from "@/lib/pollResults";

/** Extractability attribution line for one poll review -- replaces the bare
 * "Attended {year}" line that used to sit under the quote (never stacks with it) so the
 * year appears once. Omits the "attended ..." clause entirely when yearAttended is null;
 * 0 is the "Earlier" sentinel from RateForm's year-attended dropdown (see
 * yearAttendedOptions in lib/pollShared.ts), rendered as "attended earlier". Built only
 * from fields already on PollReviewItemDTO -- no new data, and the review text itself
 * is untouched. */
function reviewAttribution(programName: string, yearAttended: number | null): string {
  if (yearAttended === null) return `— Alumnus of ${programName}`;
  const yearClause = yearAttended === 0 ? "attended earlier" : `attended ${yearAttended}`;
  return `— Alumnus of ${programName}, ${yearClause}`;
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
  programName,
  summary,
}: {
  programId: string;
  // Feeds each poll review's extractability attribution line (see reviewAttribution
  // above) -- the program's real display name, never the id.
  programName: string;
  summary: ProgramReviewsSummaryDTO;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-6">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">Reviews</h2>

        {summary.pollGroups.length > 0 && (
          <div className="flex flex-col gap-6">
            {summary.pollGroups.map((group) => (
              <div key={group.questionKey} className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground">{group.questionText}</h3>
                <div className="flex flex-col gap-3">
                  {group.reviews.map((review, i) => (
                    <article key={i} className="rounded border border-border bg-surface p-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{review.text}</p>
                      <footer className="mt-2 text-xs text-muted">{reviewAttribution(programName, review.yearAttended)}</footer>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {summary.standaloneReviews.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">General reviews</h2>
          <div className="flex flex-col gap-3">
            {summary.standaloneReviews.map((review) => (
              <article key={review.id} className="rounded border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-sm">
                  <StarRating rating={review.rating} />
                  <span className="font-medium text-foreground">{review.reviewerName ?? "Anonymous"}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{review.text}</p>
              </article>
            ))}
          </div>
        </section>
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
    </div>
  );
}
