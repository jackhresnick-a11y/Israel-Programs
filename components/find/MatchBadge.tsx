import Badge from "@/components/ui/Badge";
import type { MatchBand } from "@/lib/flowRank";

const TONE: Record<MatchBand, "success" | "info" | "neutral"> = {
  strong: "success",
  partial: "info",
  weak: "neutral",
  unranked: "neutral",
};

/** Renders in ProgramCard's `action` slot on /match/results -- "4 of 6 match" for a
 * banded program, or nothing at all when nobody expressed any preference
 * (band === "unranked", where a plain count would be meaningless). */
export default function MatchBadge({ matched, total, band }: { matched: number; total: number; band: MatchBand }) {
  if (band === "unranked") return null;
  return (
    <Badge tone={TONE[band]} className="whitespace-nowrap">
      {matched} of {total} match
    </Badge>
  );
}
