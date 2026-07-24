/**
 * Pure logic for the program page's "Best for someone who wants..." strip -- no Prisma
 * import, safe for any "use client" component, same split as lib/pollFormat.ts (deleted)
 * used to be. The strip replaces the old aggregate star rating: programs differ in
 * character, not quality, so this ranks questions by how far their mean sits from the
 * neutral center (3.0) -- weighted by how *informative* that question is (its tier),
 * never by which mean is "better." Eligibility (scaleType) has nothing to do with
 * ranking weight: an EVALUATIVE question (e.g. "did Hebrew stick") can outrank a
 * DESCRIPTIVE one here while still rendering as a donut, not a spectrum track, on the
 * page -- see components/PollSummaryStrip.tsx.
 */
import type { PollQuestionTier } from "@/app/generated/prisma/enums";

/** A question is suppressed below this response count everywhere on the program page --
 * the strip's inputs, the staff-variance note, and each individual donut/track. Distinct
 * from lib/pollShared.ts's MIN_RESPONSES_FOR_RATING, which gates the (now-removed)
 * whole-program aggregate score, not a single question. */
export const MIN_RESPONSES_PER_QUESTION = 3;

/** A question's mean lands within this distance of the neutral center (3.0) is too close
 * to claim the program leans either way -- excluded from the strip even if it would
 * otherwise rank in the top 3. */
const MIN_DISTANCE_FROM_CENTER = 0.5;

/** How many phrases the generated strip shows at most. */
const MAX_STRIP_PHRASES = 3;

/** Below this many qualifying phrases, the generated strip renders nothing at all (the
 * caller falls back to ProgramPollConfig.editorialBestFor, or renders nothing if that's
 * unset too) -- a single claim about a program reads as a rating in disguise, not a
 * description. */
const MIN_STRIP_PHRASES = 2;

/**
 * The ONE place a tier's ranking weight is defined -- see PollQuestionTier's doc comment
 * in schema.prisma for what each tier means. EXCLUDED is never looked up here: it's
 * filtered out before scoring in computeBestForPhrases (a short-circuit, not a ×0), so
 * this map only ever needs to answer for the three tiers a question can actually be
 * scored under. Retune globally by editing these three numbers -- nothing else in the
 * codebase hardcodes a multiplier.
 */
export const TIER_MULTIPLIER: Record<Exclude<PollQuestionTier, "EXCLUDED">, number> = {
  DEFINING: 2.0,
  SIGNIFICANT: 1.3,
  CONTEXTUAL: 1.0,
};

export type BestForQuestionInput = {
  key: string;
  mean: number | null;
  count: number;
  lowPhrase: string | null;
  highPhrase: string | null;
  tier: PollQuestionTier;
};

/**
 * Ranks questions by tier-weighted distance from 3.0 and returns the top phrases, each
 * already resolved to its low or high side. Returns fewer than MIN_STRIP_PHRASES
 * (including an empty array) when there isn't enough to say -- callers must treat that as
 * "render nothing generated," not as a partial strip.
 *
 * Order of operations matters for correctness, not just style:
 *  1. EXCLUDED questions are dropped first, before any scoring -- an EXCLUDED question
 *     must never appear regardless of how extreme its mean is (a ×0 multiplier would
 *     technically also score it 0, but filtering explicitly here means a future tier
 *     added to the enum without a multiplier entry can't silently leak through as
 *     `undefined * distance = NaN` sorting to the top).
 *  2. The usual eligibility gates (response floor, non-null mean, distance-from-center
 *     floor) apply next, unaffected by tier -- a DEFINING question with n < 3 is exactly
 *     as ineligible as a CONTEXTUAL one; tier only ever affects ordering among questions
 *     that already cleared these gates.
 *  3. Asymmetric phrase resolution: the phrase is whichever end the mean points to
 *     (low if mean < 3, high if mean > 3). If that specific end has no phrase, the
 *     question is dropped entirely -- never backfilled from the other end and never
 *     rendered with a raw scale label. This is what lets a unipolar "strength" question
 *     (highPhrase only) contribute when the news is good and simply stay silent
 *     otherwise, rather than describing a weak outcome.
 *  4. Final score = distance × tier multiplier, sorted descending. Ties break
 *     deterministically (score desc, then response count desc, then key ascending) so
 *     the strip never reshuffles unpredictably when unrelated data changes -- see
 *     lib/pollBestFor.test.ts's shuffled-input determinism case.
 */
export function computeBestForPhrases(questions: BestForQuestionInput[]): string[] {
  const candidates = questions
    .filter((q) => q.tier !== "EXCLUDED")
    .filter((q) => q.count >= MIN_RESPONSES_PER_QUESTION && q.mean !== null)
    .map((q) => ({ ...q, distance: Math.abs(q.mean! - 3) }))
    .filter((q) => q.distance >= MIN_DISTANCE_FROM_CENTER)
    .map((q) => ({ ...q, phrase: q.mean! < 3 ? q.lowPhrase : q.highPhrase }))
    .filter((q): q is typeof q & { phrase: string } => q.phrase !== null)
    .map((q) => ({ ...q, score: q.distance * TIER_MULTIPLIER[q.tier as Exclude<PollQuestionTier, "EXCLUDED">] }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, MAX_STRIP_PHRASES);

  if (candidates.length < MIN_STRIP_PHRASES) return [];

  return candidates.map((q) => q.phrase);
}

/**
 * Whether to show the neutral "Experiences vary depending on staff." note -- true when
 * the staff-dependence question's mean leans toward "depended a lot" (>= 3.5) with enough
 * responses to trust it. Suppressed (false) when the question is unanswered, under the
 * response floor, or its mean doesn't clear the threshold. Deliberately independent of
 * tier -- this question feeds the variance note specifically (typically tiered EXCLUDED
 * so it never also competes for a strip slot), not the ranking above.
 */
export function computeVarianceNote(staffDependentQuestion: { mean: number | null; count: number } | undefined): boolean {
  if (!staffDependentQuestion) return false;
  const { mean, count } = staffDependentQuestion;
  return mean !== null && mean >= 3.5 && count >= MIN_RESPONSES_PER_QUESTION;
}
