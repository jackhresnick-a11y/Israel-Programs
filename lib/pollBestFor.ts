/**
 * Pure logic for the program page's "Best for someone who wants..." strip -- no Prisma
 * import, safe for any "use client" component, same split as lib/pollFormat.ts. The
 * strip replaces the old aggregate star rating: programs differ in character, not
 * quality, so this ranks DESCRIPTIVE questions by how far their mean sits from the
 * neutral center (3.0), never by which mean is "better."
 */

/** A question is suppressed below this response count everywhere on the program page --
 * the strip's inputs, the staff-variance note, and each individual donut/track. Distinct
 * from lib/pollShared.ts's MIN_RESPONSES_FOR_RATING, which gates the (now-removed)
 * whole-program aggregate score, not a single question. */
export const MIN_RESPONSES_PER_QUESTION = 3;

/** A DESCRIPTIVE question's mean lands within this distance of the neutral center (3.0)
 * is too close to claim the program leans either way -- excluded from the strip even if
 * it would otherwise rank in the top 3. */
const MIN_DISTANCE_FROM_CENTER = 0.5;

/** How many phrases the generated strip shows at most. */
const MAX_STRIP_PHRASES = 3;

/** Below this many qualifying phrases, the generated strip renders nothing at all (the
 * caller falls back to Program.editorialBestFor, or renders nothing if that's unset too)
 * -- a single claim about a program reads as a rating in disguise, not a description. */
const MIN_STRIP_PHRASES = 2;

export type BestForQuestionInput = {
  key: string;
  mean: number | null;
  count: number;
  lowPhrase: string | null;
  highPhrase: string | null;
};

/**
 * Ranks descriptive questions by |mean - 3| (descending) and returns the top phrases,
 * each already resolved to its low or high side. Returns fewer than MIN_STRIP_PHRASES
 * (including an empty array) when there isn't enough to say -- callers must treat that as
 * "render nothing generated," not as a partial strip.
 */
export function computeBestForPhrases(questions: BestForQuestionInput[]): string[] {
  const candidates = questions
    .filter((q) => q.count >= MIN_RESPONSES_PER_QUESTION && q.mean !== null && q.lowPhrase && q.highPhrase)
    .map((q) => ({ ...q, distance: Math.abs(q.mean! - 3) }))
    .filter((q) => q.distance >= MIN_DISTANCE_FROM_CENTER)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, MAX_STRIP_PHRASES);

  if (candidates.length < MIN_STRIP_PHRASES) return [];

  return candidates.map((q) => (q.mean! < 3 ? q.lowPhrase! : q.highPhrase!));
}

/**
 * Whether to show the neutral "Experiences vary depending on staff." note -- true when
 * the staff-dependence question's mean leans toward "depended a lot" (>= 3.5) with enough
 * responses to trust it. Suppressed (false) when the question is unanswered, under the
 * response floor, or its mean doesn't clear the threshold.
 */
export function computeVarianceNote(staffDependentQuestion: BestForQuestionInput | undefined): boolean {
  if (!staffDependentQuestion) return false;
  const { mean, count } = staffDependentQuestion;
  return mean !== null && mean >= 3.5 && count >= MIN_RESPONSES_PER_QUESTION;
}
