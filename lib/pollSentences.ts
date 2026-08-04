/**
 * Pure sentence templates over already-computed poll summary fields (mean/count/labels)
 * -- no Prisma import, same client-safe split as lib/pollBestFor.ts. Every sentence here
 * is a fixed template, never generated prose: a missing or unusable field means the
 * function returns null and the caller renders nothing for that question, rather than
 * guessing or omitting just a clause. Two shapes, matching the two result formats in
 * components/PollSummaryStrip.tsx: ringSentence() for EVALUATIVE questions (RatingRing)
 * states the numeric mean; trackSentence() for DESCRIPTIVE questions (DescriptiveTrack)
 * deliberately never states a numeric average, mirroring that component's own rule that
 * a neutral spectrum must never read as a grade.
 */

type SentenceInput = {
  questionText: string;
  programName: string;
  mean: number | null;
  count: number;
  labels: string[];
};

function responseCountPhrase(count: number): string {
  return count === 1 ? "1 response" : `${count} responses`;
}

/** Ring (EVALUATIVE) result sentence, e.g.:
 * Asked "Would you recommend it to a friend?", alumni of Otzem Overseas Program
 * (Atzmona) averaged 4.9 out of 5 (1 = Definitely not, 5 = Definitely), based on 8
 * responses.
 *
 * Anchor labels are rendered verbatim (whitespace-trimmed only, never reworded/
 * lowercased) -- some stored labels carry trailing spaces (e.g. "5 Star Hotel "). The
 * "(1 = ..., 5 = ...)" clause is dropped entirely when either end label is blank, rather
 * than rendering a broken parenthetical; the rest of the sentence still renders. Returns
 * null when there's no mean to report (unanswered/not-yet-published question) -- never
 * renders a sentence the ring itself wouldn't back up with a number. */
export function ringSentence({ questionText, programName, mean, count, labels }: SentenceInput): string | null {
  if (mean === null) return null;

  const low = labels[0]?.trim();
  const high = labels[4]?.trim();
  const anchorClause = low && high ? ` (1 = ${low}, 5 = ${high})` : "";

  return `Asked "${questionText}", alumni of ${programName} averaged ${mean.toFixed(1)} out of 5${anchorClause}, based on ${responseCountPhrase(count)}.`;
}

/** Track (DESCRIPTIVE) result sentence, e.g.:
 * Asked "How much did your experience depend on which specific staff/rabbis/madrichim
 * you got?", alumni of Otzem Overseas Program (Atzmona) answered closest to "Depended
 * somewhat", based on 9 responses.
 *
 * Deliberately carries no numeric average -- see DescriptiveTrack.tsx's own doc comment
 * for why a spectrum result must never look like a grade. The "closest to" label uses
 * the identical index expression DescriptiveTrack already renders
 * (min(4, max(0, round(mean) - 1))), so the sentence and the "Closest to:" line can never
 * disagree. Returns null when there's no mean, or when the resolved label is blank or a
 * bare number (e.g. a DESCRIPTIVE + CATEGORICAL question whose middle labels are
 * unlabeled "2"/"3"/"4" placeholders) -- a bare digit isn't a label a sentence can read
 * grammatically. */
export function trackSentence({ questionText, programName, mean, count, labels }: SentenceInput): string | null {
  if (mean === null) return null;

  const index = Math.min(4, Math.max(0, Math.round(mean) - 1));
  const closest = labels[index]?.trim();
  if (!closest || /^\d+$/.test(closest)) return null;

  return `Asked "${questionText}", alumni of ${programName} answered closest to "${closest}", based on ${responseCountPhrase(count)}.`;
}
