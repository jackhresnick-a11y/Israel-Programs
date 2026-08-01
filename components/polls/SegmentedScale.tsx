"use client";

import { cn } from "@/lib/cn";

/**
 * The style guide's segmented control (§6) -- five numbered segments, 1-5, always. Used
 * for both the numeric rating scale (STARS -- brass-filled numerals) and ordinal choice
 * questions (RADIO with an ordered spectrum -- ink-navy-filled numerals). Only the two
 * end labels (`labels[0]`/`labels[4]`) are ever displayed, as anchors beneath the bar --
 * middle labels stay in the data (still reachable via each segment's aria-label) but are
 * never rendered, so a long middle label can never wrap or overflow a segment. A
 * genuinely unordered (categorical) question does not use this control at all -- see
 * StackedChoice. The opt-out is a separate control (NaOptOut) rendered outside this one,
 * not a segment here.
 */
export default function SegmentedScale({
  labels,
  value,
  onChange,
  variant,
  ariaLabelPrefix,
}: {
  labels: string[];
  value: number | null;
  onChange: (value: number | null) => void;
  variant: "numeric" | "ordinal";
  ariaLabelPrefix: string;
}) {
  function selectValue(n: number) {
    onChange(value === n ? null : n);
  }

  const segmentClass =
    "flex min-h-11 flex-1 items-center justify-center font-mono text-sm font-medium transition-colors duration-[120ms] ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <div className="flex flex-col gap-1">
      <div
        role="group"
        aria-label={ariaLabelPrefix}
        className="flex divide-x divide-border overflow-hidden rounded border border-border"
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              aria-label={`${n} — ${labels[n - 1]}`}
              onClick={() => selectValue(n)}
              className={cn(
                segmentClass,
                selected
                  ? variant === "numeric"
                    ? "bg-accent text-accent-foreground"
                    : "bg-primary text-primary-foreground"
                  : "bg-surface text-foreground hover:bg-surface-muted"
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      {/* grid-cols-2 (= repeat(2, minmax(0,1fr))) rather than flex justify-between: the
          minmax(0,...) stops a long unbroken word from expanding its column, and the
          fixed 12px gap guarantees a channel between the two anchors regardless of
          content -- neither anchor's length can ever influence the other's wrap point. */}
      <div className="grid grid-cols-2 gap-3 px-1 text-sm text-muted">
        <span data-poll-option className="[overflow-wrap:anywhere]">
          {labels[0]}
        </span>
        <span data-poll-option className="text-right [overflow-wrap:anywhere]">
          {labels[4]}
        </span>
      </div>
    </div>
  );
}
