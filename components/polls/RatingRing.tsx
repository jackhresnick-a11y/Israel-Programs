const RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * An EVALUATIVE question's results block: a circular progress ring (fill = mean/5)
 * with the mean centered inside via SVG `<text>` -- never CSS absolute positioning,
 * so the number can't drift off-center or overlap neighboring content. Question text
 * + a "1 [low] · 5 [high]" scale line sit beside the ring; the ring is `shrink-0` and
 * the text column is `min-w-0` so long question text wraps instead of squeezing the
 * ring or overflowing horizontally. Server component, no state.
 */
export default function RatingRing({
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
  const frac = mean !== null ? Math.max(0, Math.min(1, mean / 5)) : 0;
  const offset = CIRCUMFERENCE * (1 - frac);
  const stroke = colorVar ?? "var(--accent)";

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 40 40"
        className="h-16 w-16 shrink-0"
        role="img"
        aria-label={mean !== null ? `${text}: ${mean.toFixed(1)} out of 5` : `${text}: no ratings yet`}
      >
        {/* Rotated via an SVG-native transform (not a CSS class) so the pivot is
            exact regardless of browser transform-origin defaults for SVG. Only the
            two circles rotate -- the score text stays upright and unrotated. */}
        <g transform="rotate(-90 20 20)">
          <circle cx="20" cy="20" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="4" />
          {mean !== null && (
            <circle
              cx="20"
              cy="20"
              r={RADIUS}
              fill="none"
              stroke={stroke}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
            />
          )}
        </g>
        <text
          x="20"
          y="20"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground text-[10px] font-semibold"
        >
          {mean !== null ? mean.toFixed(1) : "—"}
        </text>
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{text}</p>
        <p className="text-xs text-muted">
          1 {labels[0]} · 5 {labels[4]}
        </p>
        <span className="text-[10px] text-muted">n={count}</span>
      </div>
    </div>
  );
}
