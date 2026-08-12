/**
 * Pure, Prisma-free weighted ranking for the /match results page -- the "no hard cut"
 * half of find-v2-question-spec.md's ranking rule, plus the two-hard-eliminator
 * (REQUIRE) machinery. Everything here operates on the same FacetProgram shape
 * lib/facetCounts.ts already uses for the /programs browse filters (id, durationType,
 * tagSlugs), reusing its OR-within-category tag-group math rather than reinventing it
 * -- the two must stay in lockstep or a program that "matches" here could fail to
 * appear on /programs for the equivalent filter selection.
 *
 * Split from lib/flowShared.ts (which owns conditions/option-sets/navigation) because
 * this module's job -- turning answered options into a score -- is a genuinely
 * different concern from resolving which questions are visible.
 */
import { groupSlugsByCategory, matchedTagGroups, matchesDuration, type FacetProgram } from "@/lib/facetCounts";
import type { FlowAnswerState, FlowOptionMatchMode, FlowQuestionDTO } from "@/lib/flowShared";

export type RankableProgram = FacetProgram & { name: string };

/** One soft-weighted preference contributed by ONE answered WEIGHT-mode option. A
 * skipped or not-yet-reached question contributes no criterion at all -- see
 * buildFlowRunInput -- which is what makes "skip carries no weight" true by
 * construction rather than by an arithmetic accident (a weight-0 entry would still
 * show up in `totalCriteria` and other bookkeeping; an absent entry cannot). */
export type FlowCriterion = {
  questionKey: string;
  label: string;
  /** > 0 promotes a match, < 0 demotes one, 0 never occurs here (see
   * buildFlowRunInput, which only emits a criterion when the option carries a
   * target -- a weight without a target can't be scored either way). */
  weight: number;
  tagSlugs: string[];
  durationValues: string[];
};

/** One REQUIRE-mode option's target -- the data behind the ONLY two hard
 * eliminators the spec allows (program gender, still-in-high-school). Everything
 * else in this module is soft weighting; this is the sole place elimination logic
 * lives, and it's driven entirely by which options an admin marked REQUIRE, never
 * by a question key or slug the code recognizes. */
export type FlowRequireTarget = {
  questionKey: string;
  label: string;
  tagSlugs: string[];
  durationValues: string[];
  requireIncludesUntagged: boolean;
};

export type FlowRunInput = { criteria: FlowCriterion[]; requireTargets: FlowRequireTarget[] };

/** Splits a resolved flow's answered options by FlowOption.matchMode. Iterates
 * `visible` (not the full question bank), so a condition-hidden question's answer
 * -- already pruned out of `state` by resolveFlow -- can never leak in here either. */
export function buildFlowRunInput(visible: FlowQuestionDTO[], state: FlowAnswerState): FlowRunInput {
  const criteria: FlowCriterion[] = [];
  const requireTargets: FlowRequireTarget[] = [];
  for (const question of visible) {
    const selectedKeys = state.get(question.key);
    if (!selectedKeys || selectedKeys.length === 0) continue; // skipped or not yet reached
    for (const option of question.options) {
      if (option.status !== "ACTIVE" || !selectedKeys.includes(option.key)) continue;
      if (option.tagSlugs.length === 0 && option.durationValues.length === 0) continue; // nothing to score
      const mode: FlowOptionMatchMode = option.matchMode;
      if (mode === "REQUIRE") {
        requireTargets.push({
          questionKey: question.key,
          label: option.label,
          tagSlugs: option.tagSlugs,
          durationValues: option.durationValues,
          requireIncludesUntagged: option.requireIncludesUntagged,
        });
      } else {
        criteria.push({
          questionKey: question.key,
          label: option.label,
          weight: option.weight,
          tagSlugs: option.tagSlugs,
          durationValues: option.durationValues,
        });
      }
    }
  }
  return { criteria, requireTargets };
}

// ---------------------------------------------------------------------------
// The two hard eliminators
// ---------------------------------------------------------------------------

/** A program passes ONE REQUIRE target if it carries one of the target's tags, OR
 * -- when requireIncludesUntagged (the default) -- carries NO tag at all in any
 * category those tags belong to. Absence of a gender tag is unknown, not
 * disqualifying: excluding an untagged program would hide it from every user
 * forever over a data-quality gap, exactly the tail-cutting failure this whole
 * project exists to prevent (see FlowOption.requireIncludesUntagged's doc comment
 * in schema.prisma). Duration restrictions have no untagged case --
 * Program.durationType is a non-null column, so requireIncludesUntagged is simply
 * not consulted for a duration-only target. */
/** The set of categories a target's tagSlugs belong to -- depends only on the
 * target (+ the fixed tagCategoryBySlug), never on the program being checked, so
 * survivingPrograms below precomputes it ONCE per target rather than rebuilding
 * it on every one of the ~460 published programs it's checked against. */
function categoriesForTarget(target: FlowRequireTarget, tagCategoryBySlug: Map<string, string | null>): Set<string> {
  return new Set(target.tagSlugs.map((slug) => tagCategoryBySlug.get(slug)).filter((c): c is string => !!c));
}

function passesRequireTargetWithCategories(
  program: FacetProgram,
  target: FlowRequireTarget,
  categories: Set<string>,
  tagCategoryBySlug: Map<string, string | null>
): boolean {
  let ok = true;
  if (target.tagSlugs.length > 0) {
    const tagSet = new Set(program.tagSlugs);
    const hasAnyTargetTag = target.tagSlugs.some((slug) => tagSet.has(slug));
    if (!hasAnyTargetTag) {
      if (target.requireIncludesUntagged) {
        const hasAnyCategoryTag =
          categories.size > 0 &&
          program.tagSlugs.some((slug) => categories.has(tagCategoryBySlug.get(slug) ?? "\0uncategorized"));
        ok = !hasAnyCategoryTag; // untagged in every category the target names => passes
      } else {
        ok = false;
      }
    }
  }
  if (ok && target.durationValues.length > 0) {
    ok = matchesDuration(program, target.durationValues);
  }
  return ok;
}

export function passesRequireTarget(
  program: FacetProgram,
  target: FlowRequireTarget,
  tagCategoryBySlug: Map<string, string | null>
): boolean {
  return passesRequireTargetWithCategories(program, target, categoriesForTarget(target, tagCategoryBySlug), tagCategoryBySlug);
}

/** AND across every REQUIRE target -- each selected eliminator narrows further, so
 * two disjoint duration restrictions correctly intersect to zero survivors rather
 * than silently picking one. */
export function passesAllRequireTargets(
  program: FacetProgram,
  targets: FlowRequireTarget[],
  tagCategoryBySlug: Map<string, string | null>
): boolean {
  return targets.every((target) => passesRequireTarget(program, target, tagCategoryBySlug));
}

export function survivingPrograms<T extends RankableProgram>(
  programs: T[],
  requireTargets: FlowRequireTarget[],
  tagCategoryBySlug: Map<string, string | null>
): T[] {
  const withCategories = requireTargets.map((target) => ({
    target,
    categories: categoriesForTarget(target, tagCategoryBySlug),
  }));
  return programs.filter((program) =>
    withCategories.every(({ target, categories }) =>
      passesRequireTargetWithCategories(program, target, categories, tagCategoryBySlug)
    )
  );
}

/** Same shape and intent as lib/facetCounts.ts's dropOneCounts, which powers
 * /programs' empty-state "Remove Semester -> 26 programs" chips: for each currently
 * selected eliminator, the surviving count if that ONE eliminator were relaxed,
 * holding every other eliminator fixed. This is the blocked-filter fallback seam
 * (find-v2-question-spec.md's "Blocked-filter fallbacks -- open") -- it only answers
 * "what would relaxing each one buy"; the caller (lib/flowRun.ts, Step 5) decides
 * what to do with the numbers. */
export function hardFilterRelaxations<T extends RankableProgram>(
  programs: T[],
  requireTargets: FlowRequireTarget[],
  tagCategoryBySlug: Map<string, string | null>
): { questionKey: string; label: string; count: number }[] {
  return requireTargets.map((target) => {
    const others = requireTargets.filter((t) => t !== target);
    const count = survivingPrograms(programs, others, tagCategoryBySlug).length;
    return { questionKey: target.questionKey, label: target.label, count };
  });
}

// ---------------------------------------------------------------------------
// Weighted scoring -- no hard cut, ever
// ---------------------------------------------------------------------------

/** "A program surfaces if it matches roughly three or more filters/tags." This is
 * the ONLY place that "roughly three" is defined -- a BAND boundary, never a
 * filter. Retune by editing this number; nothing else hardcodes it. Same
 * one-place-a-threshold-lives precedent as lib/pollBestFor.ts's TIER_MULTIPLIER. */
export const STRONG_MIN_CRITERIA = 3;

export type MatchBand = "strong" | "partial" | "weak" | "unranked";

export type ScoredProgram<T extends RankableProgram> = {
  program: T;
  /** 0..1, used only to order WITHIN a band -- the band itself is a pure criteria
   * count (see rankPrograms), not a second score threshold, so "why is this program
   * here" stays explainable as a plain number of matched preferences. */
  score: number;
  matchedCriteria: number;
  totalCriteria: number;
  matchedKeys: string[];
  band: MatchBand;
};

/** A criterion's category grouping + part count depend only on the criterion
 * (+ the fixed tagCategoryBySlug), never on the program -- rankPrograms below
 * precomputes this ONCE per criterion rather than rebuilding it on every one of
 * the ~460 published programs it scores. */
function criterionParts(
  criterion: FlowCriterion,
  tagCategoryBySlug: Map<string, string | null>
): { groups: Map<string, string[]>; totalParts: number } {
  const groups = groupSlugsByCategory(tagCategoryBySlug, criterion.tagSlugs);
  const totalParts = groups.size + (criterion.durationValues.length > 0 ? 1 : 0);
  return { groups, totalParts };
}

function scoreCriterionWithParts(
  program: FacetProgram,
  criterion: FlowCriterion,
  groups: Map<string, string[]>,
  totalParts: number
): { fraction: number } {
  if (totalParts === 0) return { fraction: 0 };
  const { matched } = matchedTagGroups(program, groups);
  const hasDuration = criterion.durationValues.length > 0;
  const durationHit = hasDuration && matchesDuration(program, criterion.durationValues) ? 1 : 0;
  return { fraction: (matched + durationHit) / totalParts };
}

/** Fraction of ONE criterion's tag-categories + duration that a program matches --
 * graduated, not all-or-nothing. Matters because an option carrying tags in two
 * categories would otherwise be strictly harder to satisfy than one carrying a
 * single tag, an accident of admin data entry rather than a signal about the
 * program. Reuses matchedTagGroups (lib/facetCounts.ts), which is required to stay
 * in lockstep with /programs' own OR-within-category filtering semantics. */
export function scoreCriterion(
  program: FacetProgram,
  criterion: FlowCriterion,
  tagCategoryBySlug: Map<string, string | null>
): { fraction: number; totalParts: number } {
  const { groups, totalParts } = criterionParts(criterion, tagCategoryBySlug);
  const { fraction } = scoreCriterionWithParts(program, criterion, groups, totalParts);
  return { fraction, totalParts };
}

/** The full weighted pass. Returns every program it was given, in the same order
 * count as the input -- no .filter(), no .slice(), verified by test rather than
 * left to a comment: the spec is emphatic that cutting the tail reintroduces the
 * exact failure this project exists to fix. Weak matches sort last; they never
 * disappear. */
export function rankPrograms<T extends RankableProgram>(
  programs: T[],
  criteria: FlowCriterion[],
  tagCategoryBySlug: Map<string, string | null>
): ScoredProgram<T>[] {
  // A weight of 0 or a target-less criterion can't move the score either direction;
  // dropping it up front keeps totalWeight (the normalizer) honest.
  const active = criteria.filter(
    (c) => c.weight !== 0 && (c.tagSlugs.length > 0 || c.durationValues.length > 0)
  );
  // Normalized by the SUM OF MAGNITUDES, not the signed sum: a negative-weight
  // criterion (e.g. "school killed it for me" demoting intensive-learning programs)
  // must still contribute to how much total signal a 3-answer run vs. a 7-answer
  // run carries -- a signed sum could shrink toward zero and blow up the division
  // the moment likes and dislikes roughly cancel out.
  const totalWeight = active.reduce((sum, c) => sum + Math.abs(c.weight), 0);
  const positiveCount = active.filter((c) => c.weight > 0).length;
  const strongThreshold = Math.min(STRONG_MIN_CRITERIA, positiveCount);
  const activeWithParts = active.map((criterion) => ({ criterion, ...criterionParts(criterion, tagCategoryBySlug) }));

  return programs
    .map((program) => {
      let weightedSum = 0;
      let matchedCriteria = 0;
      const matchedKeys: string[] = [];
      for (const { criterion, groups, totalParts } of activeWithParts) {
        const { fraction } = scoreCriterionWithParts(program, criterion, groups, totalParts);
        weightedSum += criterion.weight * fraction;
        // Only a POSITIVE-weight match counts as a matched preference -- a program
        // that happens to carry a disliked tag is being demoted, not "matched", so
        // it must not read as a stronger result than one that simply didn't trigger
        // the same criterion.
        if (criterion.weight > 0 && fraction > 0) {
          matchedCriteria++;
          matchedKeys.push(criterion.questionKey);
        }
      }
      const score = totalWeight === 0 ? 0 : weightedSum / totalWeight;
      const band: MatchBand =
        active.length === 0
          ? "unranked"
          : strongThreshold > 0 && matchedCriteria >= strongThreshold
            ? "strong"
            : matchedCriteria >= 1
              ? "partial"
              : "weak";
      return { program, score, matchedCriteria, totalCriteria: active.length, matchedKeys, band };
    })
    .sort(
      (a, b) =>
        b.score - a.score || b.matchedCriteria - a.matchedCriteria || a.program.name.localeCompare(b.program.name)
    );
}
