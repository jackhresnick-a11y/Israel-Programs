"use client";

import { cn } from "@/lib/cn";

/**
 * The style guide's segmented control (§6), covering both the numbered rating scale
 * (STARS -- brass-filled numerals) and the choice-chip scale (RADIO -- ink-navy-filled
 * word labels). A trailing "Skip" segment replaces the old standalone N/A checkbox --
 * same `na`/`onNaChange` contract QuestionInput has always exposed, so nothing about how
 * a skip is stored downstream changes. Under 380px width the control stacks to
 * full-width 44px rows instead of squeezing six segments into one line.
 */
export default function SegmentedScale({
  labels,
  value,
  onChange,
  na,
  onNaChange,
  variant,
  ariaLabelPrefix,
}: {
  labels: string[];
  value: number | null;
  onChange: (value: number | null) => void;
  na: boolean;
  onNaChange: (na: boolean) => void;
  variant: "numeric" | "labels";
  ariaLabelPrefix: string;
}) {
  function selectValue(n: number) {
    if (na) onNaChange(false);
    onChange(value === n ? null : n);
  }

  function toggleSkip() {
    const next = !na;
    onNaChange(next);
    if (next) onChange(null);
  }

  // min-w-0 overrides flexbox's default min-width:auto -- without it, a flex-1 segment
  // refuses to shrink below its unwrapped content width, which pushes the whole row past
  // the viewport at 390px instead of distributing evenly. [overflow-wrap:anywhere] (not
  // Tailwind's break-words/overflow-wrap:break-word) is required on top of that: per the
  // CSS Text spec, break-word affects rendering overflow but NOT the intrinsic
  // min-content size flexbox uses to size a flex-1 item, so a long single word (e.g.
  // "Depended", "completely") still overflowed its segment by a few px even with
  // min-w-0 + break-words -- only overflow-wrap:anywhere feeds into that same intrinsic
  // sizing pass, closing the gap for real (verified by re-screenshotting the DB's actual
  // longest DESCRIPTIVE labels, not just the RADIO scale's short ones).
  const segmentClass =
    "flex min-h-11 min-w-0 flex-1 items-center justify-center [overflow-wrap:anywhere] px-2 py-2 text-center text-sm font-medium transition-colors duration-[120ms] ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded border border-border min-[380px]:flex-row min-[380px]:divide-x min-[380px]:divide-y-0">
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              aria-label={variant === "numeric" ? `${n} — ${labels[n - 1]}` : labels[n - 1]}
              onClick={() => selectValue(n)}
              className={cn(
                segmentClass,
                variant === "numeric" && "font-mono",
                selected
                  ? variant === "numeric"
                    ? "bg-accent text-accent-foreground"
                    : "bg-primary text-primary-foreground"
                  : "bg-surface text-foreground hover:bg-surface-muted"
              )}
            >
              {variant === "numeric" ? n : labels[n - 1]}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={na}
          aria-label={`Skip — ${ariaLabelPrefix}`}
          onClick={toggleSkip}
          className={cn(segmentClass, na ? "bg-border text-foreground" : "bg-surface text-muted hover:bg-surface-muted")}
        >
          Skip
        </button>
      </div>
      {variant === "numeric" && (
        <div className="flex justify-between px-1 text-sm text-muted">
          <span>{labels[0]}</span>
          <span>{labels[4]}</span>
        </div>
      )}
    </div>
  );
}
