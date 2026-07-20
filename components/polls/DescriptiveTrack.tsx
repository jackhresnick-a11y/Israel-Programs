import { formatStarsMean } from "@/lib/pollFormat";

/** Which two labels flank the ball and where the ball sits, out of the question's full
 * 5-value label set. One unified rule: the window is always [floor, floor+1] (clamped
 * so mean 5 uses [4,5]), and the ball sits at the fractional position within it. A
 * whole-number mean therefore lands the ball exactly on one end's rung -- mean 3.0 ->
 * window [C,D], ball on C at the left end ("right at C"); mean 5.0 -> window [D,E], ball
 * on E at the right end. No separate centered-label case, which is what keeps the layout
 * one code path. `mean` is assumed non-null (the empty state is handled before this). */
function trackGeometry(mean: number, labels: string[]): { left: string; right: string; frac: number } {
  const lo = Math.max(1, Math.min(4, Math.floor(mean)));
  const hi = lo + 1;
  const frac = Math.max(0, Math.min(1, mean - lo));
  return { left: labels[lo - 1], right: labels[hi - 1], frac };
}

/** Horizontal position of a marker as a CSS length that keeps a 12px-wide marker fully
 * on the track at frac 0 and 1 (its center travels within [6px, width-6px]). */
function markerLeft(frac: number): string {
  return `calc(6px + (100% - 12px) * ${frac})`;
}

/** Edge-clamped horizontal transform so the numeric label under the ball can't push past
 * the track ends: left-anchored at frac 0, right-anchored at frac 1, centered elsewhere. */
function labelTransform(frac: number): string {
  if (frac <= 0.02) return "translateX(0)";
  if (frac >= 0.98) return "translateX(-100%)";
  return "translateX(-50%)";
}

/**
 * A DESCRIPTIVE question's results cell: a horizontal spectrum track, never a star or a
 * graded circle (a star implies good/bad, wrong for a neutral spectrum). Takes its own
 * full-width row in the bucket grid (`col-span-2 sm:col-span-3`) so the line has real
 * width and the -- often long -- endpoint label phrases have room to wrap *above* the
 * line rather than being crammed inline beside a phone-width track (the mobile failure
 * mode of earlier attempts). Server component, no state -- `scaleType` alone decides
 * track vs. star; there is deliberately no toggle.
 */
export default function DescriptiveTrack({
  text,
  mean,
  count,
  labels,
  colorVar,
}: {
  text: string;
  mean: number | null;
  count: number;
  labels: string[];
  colorVar: string | null;
}) {
  // Empty state: show the full spectrum's endpoint labels and no ball.
  const { left, right, frac } =
    mean === null ? { left: labels[0], right: labels[4], frac: 0 } : trackGeometry(mean, labels);

  return (
    <div className="col-span-2 flex flex-col gap-2 rounded-xl border border-border p-3 sm:col-span-3">
      <p className="text-xs font-medium text-foreground">{text}</p>
      <div className="flex justify-between gap-3 text-[11px] text-foreground">
        <span className="max-w-[47%] text-left">{left}</span>
        <span className="max-w-[47%] text-right">{right}</span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-surface-muted">
        {mean !== null && (
          <span
            className="absolute top-1/2 h-3 w-3 rounded-full border-2 border-surface"
            style={{
              left: markerLeft(frac),
              transform: "translate(-50%, -50%)",
              backgroundColor: colorVar ?? "var(--muted)",
            }}
          />
        )}
      </div>
      {mean !== null && (
        <div className="relative h-4">
          <span
            className="absolute text-[10px] font-semibold text-foreground"
            style={{ left: markerLeft(frac), transform: labelTransform(frac) }}
          >
            {formatStarsMean(mean)}
          </span>
        </div>
      )}
      <span className="text-[10px] text-muted">n={count}</span>
    </div>
  );
}
