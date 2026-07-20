"use client";

import { useState } from "react";
import { formatStarsMean } from "@/lib/pollFormat";

type LabelChip = { text: string; position: number; muted: boolean };

/** Which labels flank the mean and where the ball sits, out of the question's full
 * 5-value label set. A fractional mean (e.g. 3.7) shows exactly the two labels its
 * floor/ceil fall between, at the track's ends, with the ball at the fractional
 * position -- e.g. 3.7 = 70% from the floor label toward the ceil label. A
 * whole-number mean has no "between" to show, so it centers the ball on that rung's
 * own label and adds its neighbors, muted, at the track ends purely for context. */
function trackChips(mean: number, labels: string[]): { chips: LabelChip[]; ballPercent: number } {
  const m = Math.max(1, Math.min(5, mean));
  const lo = Math.floor(m);
  const hi = Math.ceil(m);

  if (lo !== hi) {
    return {
      chips: [
        { text: labels[lo - 1], position: 0, muted: false },
        { text: labels[hi - 1], position: 100, muted: false },
      ],
      ballPercent: (m - lo) * 100,
    };
  }

  const n = lo;
  const ballPercent = n === 1 ? 0 : n === 5 ? 100 : 50;
  const chips: LabelChip[] = [{ text: labels[n - 1], position: ballPercent, muted: false }];
  if (n > 1) chips.unshift({ text: labels[n - 2], position: 0, muted: true });
  if (n < 5) chips.push({ text: labels[n], position: 100, muted: true });
  return { chips, ballPercent };
}

/** 0%/100% chips are edge-anchored (no horizontal overflow past the track); only a
 * centered rung label (the whole-number case) needs true centering. */
function chipTransform(position: number): string {
  if (position === 0) return "translateX(0)";
  if (position === 100) return "translateX(-100%)";
  return "translateX(-50%)";
}

/**
 * A DESCRIPTIVE question's results cell -- never a star, never a graded fill (a
 * descriptive question is a neutral spectrum, not "higher is better"). Defaults to
 * the plain "x.x / 5" number; a per-question toggle reveals the floor/ceil words
 * track, since the words are the point of a descriptive question but take more room
 * than every viewer wants by default.
 */
export default function DescriptiveQuestionCell({
  mean,
  count,
  labels,
  colorVar,
}: {
  mean: number | null;
  count: number;
  labels: string[];
  colorVar: string | null;
}) {
  const [showWords, setShowWords] = useState(false);

  if (mean === null) {
    return (
      <div className="flex w-full flex-col items-center gap-1.5">
        <p className="text-sm font-semibold text-foreground">---</p>
        <span className="text-[10px] text-muted">n={count}</span>
      </div>
    );
  }

  const { chips, ballPercent } = trackChips(mean, labels);

  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-foreground">{formatStarsMean(mean)} / 5</p>
        <button
          type="button"
          onClick={() => setShowWords((prev) => !prev)}
          className="rounded text-[10px] font-medium text-muted underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {showWords ? "Show 1–5" : "Show words"}
        </button>
      </div>
      {showWords && (
        <div className="flex w-full flex-col gap-2">
          <div className="relative h-1.5 w-full rounded-full bg-surface-muted">
            <span
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
              style={{ left: `${ballPercent}%`, backgroundColor: colorVar ?? "var(--muted)" }}
            />
          </div>
          <div className="relative h-8 text-[10px]">
            {chips.map((chip, i) => (
              <span
                key={i}
                className={`absolute whitespace-nowrap ${chip.muted ? "text-muted/60" : "text-foreground"}`}
                style={{ left: `${chip.position}%`, transform: chipTransform(chip.position) }}
              >
                {chip.text}
              </span>
            ))}
          </div>
        </div>
      )}
      <span className="text-[10px] text-muted">n={count}</span>
    </div>
  );
}
