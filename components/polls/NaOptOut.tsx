"use client";

import { cn } from "@/lib/cn";

/**
 * The opt-out control, relabelled "N/A" and moved out of the answer row entirely (it
 * used to be a same-width trailing segment inside SegmentedScale, eating a sixth of the
 * row's width for a control that isn't an answer). Purely presentational -- the stored
 * value and behaviour are unchanged: toggling still flows through the same `na`/
 * `onNaChange` contract QuestionInput has always exposed, still clears any selected
 * value, still results in no PollAnswer row plus the question's id added to
 * PollResponse.naQuestionIds (lib/pollResponses.ts's saveAnswer).
 */
export default function NaOptOut({
  na,
  onToggle,
  ariaLabelPrefix,
}: {
  na: boolean;
  onToggle: () => void;
  ariaLabelPrefix: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={na}
      aria-label={`Not applicable — ${ariaLabelPrefix}`}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-2 transition-colors duration-[120ms] ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        na ? "font-medium text-foreground" : "text-muted hover:text-foreground"
      )}
    >
      N/A
    </button>
  );
}
