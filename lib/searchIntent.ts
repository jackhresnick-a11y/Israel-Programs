/**
 * Turns a free-text assistant message into structured search facets, scored via
 * lib/flowRank.ts's weighted "no hard cut" engine -- the same ranking rule
 * find-v2-question-spec.md defines for /match ("A program surfaces if it matches
 * roughly three or more filters/tags; more matches ranks higher. No hard cut on low
 * match count."). Reused here rather than reinvented so the assistant's retrieval
 * behavior matches the rest of the app's established "never eliminate on soft
 * preferences" posture.
 *
 * Pure, Prisma-free -- like lib/flowShared.ts/lib/pollShared.ts, this only operates on
 * plain data callers pass in (a live tag vocabulary, a tag-category map), never fetches
 * anything itself. AIProvider.parseSearchQuery (lib/ai/) is the only thing that produces
 * a ParsedSearchQuery; this module turns that into scoring criteria and back into
 * plain-language "what didn't match" labels.
 */
import type { DurationType } from "@/app/generated/prisma/enums";
import type { ParsedSearchQuery, TagVocabEntry } from "@/lib/ai/types";
import type { FlowCriterion, RankableProgram, ScoredProgram } from "@/lib/flowRank";

export type { TagVocabEntry };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches phrases (tag name, or slug with hyphens read as spaces) against the message
 * as whole words -- "tech" matches "...tech internship..." but not "...biotech...".
 * Multi-word tag names ("Gap Year") match as a contiguous phrase, not word-by-word, so
 * "year" alone in an unrelated sentence doesn't credit an unrelated "Gap Year" tag. An
 * optional trailing "s"/"es" is allowed before the closing boundary so a simple plural
 * ("internships" for tag "internship") still matches -- still protected against a
 * false positive like "art" inside "article", which isn't phrase-plus-suffix. */
export function matchTagVocabulary(message: string, vocab: TagVocabEntry[]): string[] {
  const lower = message.toLowerCase();
  const matched = new Set<string>();
  for (const tag of vocab) {
    const phrases = new Set([tag.name.toLowerCase(), tag.slug.toLowerCase().replace(/-/g, " ")]);
    for (const phrase of phrases) {
      if (phrase.length < 2) continue;
      const re = new RegExp(`\\b${escapeRegExp(phrase)}(?:es|s)?\\b`);
      if (re.test(lower)) {
        matched.add(tag.slug);
        break;
      }
    }
  }
  return Array.from(matched);
}

// Generalizes NullProvider's old single-value DURATION_KEYWORDS map to a list, since a
// message can plausibly imply more than one acceptable duration ("summer or gap year").
const DURATION_KEYWORDS: { keyword: string; value: DurationType }[] = [
  { keyword: "10 day", value: "TEN_DAY" },
  { keyword: "10-day", value: "TEN_DAY" },
  { keyword: "summer", value: "SUMMER" },
  { keyword: "semester", value: "SEMESTER" },
  { keyword: "gap year", value: "GAP_YEAR" },
  { keyword: "gap-year", value: "GAP_YEAR" },
  { keyword: "yeshiva", value: "GAP_YEAR" },
  { keyword: "seminary", value: "GAP_YEAR" },
  { keyword: "multi year", value: "MULTI_YEAR" },
  { keyword: "multi-year", value: "MULTI_YEAR" },
  { keyword: "multiple years", value: "MULTI_YEAR" },
  { keyword: "ongoing", value: "ONGOING" },
];

export function parseDurationKeywords(message: string): DurationType[] {
  const lower = message.toLowerCase();
  const found = new Set<DurationType>();
  for (const { keyword, value } of DURATION_KEYWORDS) {
    if (lower.includes(keyword)) found.add(value);
  }
  return Array.from(found);
}

/** Drops any parsed tag slug with no matching live Tag row -- same degrade-quietly-at-
 * read-time posture as lib/finderTargets.ts's assembleProgramsHref: a slug can go stale
 * (renamed/deleted) between when a provider was built/prompted and when it runs, and a
 * stale slug should silently not contribute a criterion rather than error or crash the
 * assistant. Never widens or corrects a slug -- only ever removes. */
export function validateParsedQuery(parsed: ParsedSearchQuery, vocab: TagVocabEntry[]): ParsedSearchQuery {
  const validSlugs = new Set(vocab.map((t) => t.slug));
  return {
    ...parsed,
    tags: parsed.tags?.filter((slug) => validSlugs.has(slug)),
  };
}

/** One FlowCriterion per parsed facet (each parsed tag its own criterion, plus one for
 * duration if present) rather than bundling every tag into a single criterion --
 * matches lib/flowRank.ts's per-preference scoring model, where `matchedCriteria` counts
 * distinct facets satisfied (feeding the strong/partial/weak band and the "roughly three
 * or more" threshold), not distinct tags within one facet. */
export function buildSearchCriteria(parsed: ParsedSearchQuery, vocab: TagVocabEntry[]): FlowCriterion[] {
  const nameBySlug = new Map(vocab.map((t) => [t.slug, t.name]));
  const criteria: FlowCriterion[] = [];
  for (const slug of parsed.tags ?? []) {
    criteria.push({
      questionKey: `tag:${slug}`,
      label: nameBySlug.get(slug) ?? slug,
      weight: 1,
      tagSlugs: [slug],
      durationValues: [],
    });
  }
  if (parsed.duration && parsed.duration.length > 0) {
    criteria.push({
      questionKey: "duration",
      label: "Duration",
      weight: 1,
      tagSlugs: [],
      durationValues: parsed.duration,
    });
  }
  return criteria;
}

/** Which parsed constraints a scored program did NOT satisfy, in plain language --
 * ScoredProgram.matchedKeys already carries the questionKey of every criterion this
 * program matched (lib/flowRank.ts's rankPrograms), so this is just the complement. Lets
 * the assistant state honestly "doesn't have the tech tag" rather than silently omitting
 * a candidate that only partially fits, per the "never hard-cut, state what's missing"
 * requirement. */
export function unmetLabels<T extends RankableProgram>(
  scored: ScoredProgram<T>,
  criteria: FlowCriterion[]
): string[] {
  const matchedSet = new Set(scored.matchedKeys);
  return criteria.filter((c) => c.weight > 0 && !matchedSet.has(c.questionKey)).map((c) => c.label);
}
