"use client";

import { cn } from "@/lib/cn";

/**
 * Answer control for a categorical question (lib/pollShared.ts's resolveOptionKind ==
 * "categorical") -- an unordered set of alternatives (e.g. unit_assignments: different
 * kinds of army unit, not different amounts of one thing). Renders one full-width row
 * per option, left-aligned, the entire row tappable -- never horizontally divided
 * segments, which is what caused long labels to wrap 8+ lines and clip at 390px. Every
 * row is `w-full` with no `flex-1`/`min-w-0`/breakpoint variant, so a sibling can never
 * squeeze it -- there is no layout state this control can be in that re-introduces
 * horizontal segmentation.
 *
 * Value semantics match SegmentedScale exactly: row index i writes value i+1 (still a
 * 1-5 index into `labels`, same PollAnswer.value column, same CHECK constraint),
 * re-tapping the selected row clears it back to unanswered.
 */
export default function StackedChoice({
  labels,
  value,
  onChange,
  ariaLabelPrefix,
}: {
  labels: string[];
  value: number | null;
  onChange: (value: number | null) => void;
  ariaLabelPrefix: string;
}) {
  function select(n: number) {
    onChange(value === n ? null : n);
  }

  return (
    <div
      role="group"
      aria-label={ariaLabelPrefix}
      className="flex flex-col divide-y divide-border overflow-hidden rounded border border-border"
    >
      {labels.map((label, i) => {
        const n = i + 1;
        const selected = value === n;
        return (
          <button
            key={i}
            type="button"
            data-poll-option
            aria-pressed={selected}
            onClick={() => select(n)}
            className={cn(
              "flex min-h-11 w-full items-center px-3 py-2.5 text-left text-sm font-medium [overflow-wrap:anywhere] transition-colors duration-[120ms] ease-out focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
              selected ? "bg-primary text-primary-foreground" : "bg-surface text-foreground hover:bg-surface-muted"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
