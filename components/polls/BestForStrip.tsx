import Card from "@/components/ui/Card";

/**
 * The program page's fit summary -- replaces the old aggregate star rating. Deliberately
 * carries no score, ring, or number: it's phrased as fit ("Best for someone who
 * wants...") never as praise. Three states, in priority order:
 *   1. `editorialBestFor` set -> render it verbatim (a moderator/admin sees a subtle
 *      "Editorial override" indicator; a public visitor sees plain text with no tell).
 *   2. Two or more generated `phrases` -> "Best for someone who wants A · B · C".
 *   3. Otherwise -> render nothing (not even the Card), so a program with too little
 *      descriptive data simply has no strip rather than an empty placeholder box.
 * `varianceNote` renders as a neutral aside directly under the strip content, in either
 * of the first two states -- see lib/pollBestFor.ts's computeVarianceNote.
 */
export default function BestForStrip({
  phrases,
  editorialBestFor,
  varianceNote,
  isModerator,
}: {
  phrases: string[];
  editorialBestFor: string | null;
  varianceNote: boolean;
  isModerator: boolean;
}) {
  const hasOverride = editorialBestFor !== null;
  const hasGenerated = phrases.length >= 2;
  if (!hasOverride && !hasGenerated) return null;

  // One flowing sentence, not a separate label line above the phrases -- at up to
  // three phrases this reflows to roughly two lines at 390px; a label row on its own
  // line would burn a whole line before any content, pushing three phrases to three
  // lines. Plain text (not per-phrase spans) so the browser wraps at ordinary word
  // boundaries instead of forcing a break before whichever phrase doesn't fit.
  const content = hasOverride ? editorialBestFor : phrases.join(" · ");

  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-sm leading-snug text-foreground">
        <span className="font-medium">Best for someone who wants </span>
        {content}
      </p>
      {hasOverride && isModerator && (
        <span className="self-start rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-muted">
          Editorial override
        </span>
      )}
      {varianceNote && <p className="text-xs text-muted">Experiences vary depending on staff.</p>}
    </Card>
  );
}
