/** Horizontal position of a marker as a CSS length that keeps a 12px-wide marker fully
 * on the track at frac 0 and 1 (its center travels within [6px, width-6px]). */
function markerLeft(frac: number): string {
  return `calc(6px + (100% - 12px) * ${frac})`;
}

/**
 * A DESCRIPTIVE question's results block: a horizontal spectrum track, never a star or
 * a graded ring (a star/ring implies good/bad, wrong for a neutral spectrum where
 * neither end is "better"). Deliberately fully vertical below the track -- the two end
 * labels sit on their own line under the track (never squeezed inline beside it), and
 * there is no number rendered on the dot itself; a separate "Closest to" line spells out
 * which option the average is nearest. This is the one format for every DESCRIPTIVE
 * question regardless of label length -- earlier attempts that tried to fit labels for
 * all 5 values across one line are what caused overlap on narrow screens. The tick
 * marks + dot are positioned, but strictly contained within the track element (the only
 * positioned context in this component). Server component, no state.
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
  const frac = mean !== null ? Math.max(0, Math.min(1, (mean - 1) / 4)) : null;
  const closestLabel = mean !== null ? labels[Math.min(4, Math.max(0, Math.round(mean) - 1))] : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">{text}</p>
      <div className="relative h-2 w-full rounded-full bg-surface-muted">
        {[0, 0.25, 0.5, 0.75, 1].map((tickFrac) => (
          <span
            key={tickFrac}
            className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded-full bg-border"
            style={{ left: markerLeft(tickFrac) }}
          />
        ))}
        {frac !== null && (
          <span
            className="absolute top-1/2 h-3.5 w-3.5 rounded-full border-2 border-surface"
            style={{
              left: markerLeft(frac),
              transform: "translate(-50%, -50%)",
              backgroundColor: colorVar ?? "var(--muted)",
            }}
          />
        )}
      </div>
      <div className="flex justify-between gap-3 text-xs text-muted">
        <span className="max-w-[47%] text-left">1 {labels[0]}</span>
        <span className="max-w-[47%] text-right">5 {labels[4]}</span>
      </div>
      {closestLabel !== null && (
        <p className="text-xs text-muted">
          Closest to: <span className="text-foreground">{closestLabel}</span>
        </p>
      )}
      <span className="text-[10px] text-muted">n={count}</span>
    </div>
  );
}
