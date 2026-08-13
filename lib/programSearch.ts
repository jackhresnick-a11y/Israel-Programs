/**
 * Split out of lib/programs.ts so both the server-side directory search
 * (listPrograms/getFacetData) and the client-side /rate program picker
 * (components/RateProgramPicker.tsx) share one ranking implementation -- same
 * "pure logic for client import" precedent as lib/pollShared.ts / lib/tagTints.ts.
 * This file has NO Prisma import (it ranks already-fetched arrays); its only
 * dependency is Fuse, so a "use client" component can import it directly.
 */
import Fuse from "fuse.js";

// Weighted fuzzy-search keys for the free-text `q` box. Name/org/tags rank
// highest since a match there is almost always what the user meant; location
// and goodFor/description are searched too (unlike the old exact-substring
// query, which skipped them) but weighted low so a stray match deep in a
// long description doesn't outrank a real name/tag hit.
const SEARCH_KEYS: { name: string; weight: number }[] = [
  { name: "name", weight: 3 },
  // Same weight as the English name -- a Hebrew query matching the official Hebrew name
  // is just as strong a signal as an English query matching the English name.
  { name: "nameHe", weight: 3 },
  { name: "organization", weight: 2 },
  { name: "tags.name", weight: 2 },
  { name: "tags.slug", weight: 2 },
  { name: "location", weight: 1 },
  { name: "goodFor", weight: 1 },
  { name: "description", weight: 1 },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type Searchable = {
  name: string;
  nameHe: string | null;
  organization: string | null;
  location: string | null;
  goodFor: string | null;
  description: string;
  tags: { name: string; slug: string }[];
};

// Fuse bitap-matches the *entire* query string as a single pattern against
// each field -- it never splits "modern orthodox gap year" into words. A
// program whose TAGS collectively cover every word (e.g. yeshiva + gap-year +
// modern-orthodox as three separate tags) has no single field containing the
// whole phrase, so Fuse drops it even though every word is genuinely present
// somewhere on the program. Tokenizing the query and requiring each token to
// match *some* field (not all in the same field) fixes that without giving up
// Fuse's typo tolerance, which still runs in parallel for fuzzy recall.
//
// Strips leading/trailing punctuation from every token (not just a leading
// "#"), Unicode-aware via \p{L}/\p{N} so Hebrew letters are never treated as
// punctuation -- a conversational query like "exploring Israel experience?"
// used to leave the trailing "?" glued onto "experience", so that token could
// never substring-match the field text "experience" anywhere in the catalog.
// Internal punctuation (gap-year, co-ed) is left alone since it's part of the
// token, not a boundary.
function tokenize(term: string): string[] {
  return term
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((t) => t.length >= 2);
}

function haystacks(program: Searchable): string[] {
  return [
    program.name,
    program.nameHe ?? "",
    program.organization ?? "",
    program.location ?? "",
    program.goodFor ?? "",
    program.description,
    ...program.tags.flatMap((t) => [t.name, t.slug]),
  ].map((s) => s.toLowerCase());
}

/** How many tokens substring-match at least one field (not necessarily the same
 * field) -- a count, not a pass/fail, so a query with one unmatched filler word
 * (e.g. "that", "programs") demotes a program instead of eliminating it. See
 * rankBySearchTermScored, which is the only place a coverage count of less than
 * the full token set is allowed to still surface a result. */
function matchedTokenCount(program: Searchable, tokens: string[]): number {
  const hay = haystacks(program);
  return tokens.filter((tok) => hay.some((h) => h.includes(tok))).length;
}

/** Every token substring-matches at least one field. Used only for relevanceTier's
 * tier-3 signal ("closest match" ordering), which must stay strict/full-coverage --
 * partial coverage's own weaker-but-still-relevant treatment lives in
 * rankBySearchTermScored's candidate gate + sort, not here. */
function matchesAllTokens(program: Searchable, tokens: string[]): boolean {
  return matchedTokenCount(program, tokens) === tokens.length;
}

// Fuse's weighted multi-key blend can let a program that matches several
// low-weight fields fuzzily outrank one with a single strong, literal match --
// there's no "closest match wins" guarantee from field weights alone. This
// tier is computed on top of (not instead of) Fuse's fuzzy candidate set, so a
// literal/near-literal match always sorts above a fuzzy-only one, while Fuse's
// own score still breaks ties within a tier and keeps typo-tolerant recall.
function relevanceTier(
  program: Searchable,
  termLower: string,
  tokens: string[]
): number {
  const name = program.name.toLowerCase();
  // Hebrew has no case, so .toLowerCase() is a harmless no-op here -- kept only so
  // nameHe goes through the same shape as every other field below.
  const nameHe = program.nameHe?.toLowerCase() ?? "";
  const org = program.organization?.toLowerCase() ?? "";
  const tagNames = program.tags.map((t) => t.name.toLowerCase());
  const tagSlugs = program.tags.map((t) => t.slug.toLowerCase());

  if (
    name === termLower ||
    (nameHe !== "" && nameHe === termLower) ||
    tagNames.includes(termLower) ||
    tagSlugs.includes(termLower)
  ) {
    return 0; // exact name (English or Hebrew) or exact tag match
  }
  if (name.startsWith(termLower) || org.startsWith(termLower) || (nameHe !== "" && nameHe.startsWith(termLower))) {
    return 1; // name/org/Hebrew-name starts with the whole term
  }
  if (tokens.length > 0) {
    // \b (JS regex word-boundary) is defined via \w, which does not include Hebrew
    // letters -- a \b-based check silently never fires against Hebrew text. nameHe is
    // therefore matched with a plain substring check instead of reusing wordBoundary,
    // rather than relying on an English-only heuristic that would look like it covers
    // Hebrew but never actually matches it.
    const tokenInNameOrOrg = (tok: string) => {
      const wb = new RegExp(`\\b${escapeRegExp(tok)}`);
      return wb.test(name) || wb.test(org) || nameHe.includes(tok);
    };
    if (tokens.every(tokenInNameOrOrg)) {
      return 1; // every word appears (word-boundary, or substring for Hebrew) in the name/org
    }
    const tokenInNameOrgOrTags = (tok: string) =>
      tokenInNameOrOrg(tok) ||
      tagSlugs.some((slug) => slug.startsWith(tok) || slug.includes(tok)) ||
      tagNames.some((n) => n.includes(tok));
    if (tokens.every(tokenInNameOrgOrTags)) {
      return 2; // every word is covered by name/org/tags (not necessarily the same field)
    }
    if (matchesAllTokens(program, tokens)) {
      return 3; // every word is covered somewhere (including location/goodFor/description)
    }
    return 4; // fuzzy-only match (typo-distance)
  }
  const wordBoundary = new RegExp(`\\b${escapeRegExp(termLower)}`);
  if (
    wordBoundary.test(name) ||
    wordBoundary.test(org) ||
    (nameHe !== "" && nameHe.includes(termLower)) ||
    tagSlugs.some((slug) => slug.startsWith(termLower))
  ) {
    return 2; // word-boundary match in name/org (or substring match in nameHe), or tag slug prefix
  }
  if (
    name.includes(termLower) ||
    org.includes(termLower) ||
    tagNames.some((t) => t.includes(termLower)) ||
    tagSlugs.some((s) => s.includes(termLower))
  ) {
    return 3; // substring match in name/org/tags
  }
  return 4; // fuzzy-only match (location/goodFor/description or typo-distance)
}

export type ScoredSearchResult<T> = {
  item: T;
  /** How many query tokens this program matched (see matchedTokenCount). 0 when the
   * query has no tokens (e.g. a single short/typo'd word) -- there's nothing to
   * partially cover, so coverage plays no role and `full` is vacuously true. */
  matchedTokens: number;
  totalTokens: number;
  /** matchedTokens === totalTokens (or totalTokens === 0) -- the browse page's
   * full-vs-"weaker matches" band boundary, and the assistant's signal that a
   * candidate satisfies every parsed constraint. */
  full: boolean;
};

// The candidate set is the UNION of Fuse's fuzzy matches (typo tolerance) and ANY
// program matching at least one token -- not every token. Requiring every token
// (the old behavior) meant a single filler/typo'd word in a long conversational query
// zeroed the entire result set instead of just demoting the affected programs; see
// matchedTokenCount above. Coverage (how many tokens matched) is the primary sort key
// -- a full-coverage program always ranks above a partial one -- with relevanceTier
// then ordering same-coverage results and Fuse's own score breaking ties within a tier.
// This is strictly additive over the old candidate set: every program that used to
// qualify (Fuse hit, or all-tokens-matched) still qualifies and sorts identically
// relative to other full-coverage results; partial matches are newly appended below.
// Shared by the directory search (listPrograms/getFacetData in lib/programs.ts) and the
// /rate program picker so both rank identically over whatever fields each feeds in.
// Callers whose items lack a field (e.g. the picker leaves description/goodFor empty)
// simply get no matches from it -- the ranking on the populated fields is unchanged.
export function rankBySearchTermScored<T extends Searchable & { id: string }>(
  programs: T[],
  term: string
): ScoredSearchResult<T>[] {
  const fuse = new Fuse(programs, {
    keys: SEARCH_KEYS,
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  });

  const termLower = term.toLowerCase();
  const tokens = tokenize(term);
  const fuseScores = new Map(fuse.search(term).map((r) => [r.item.id, r.score ?? 1]));

  const withCoverage = programs.map((program) => ({
    program,
    matched: tokens.length > 0 ? matchedTokenCount(program, tokens) : 0,
  }));

  const candidates = withCoverage.filter(({ program, matched }) => fuseScores.has(program.id) || matched > 0);

  return candidates
    .map(({ program, matched }) => ({
      item: program,
      tier: relevanceTier(program, termLower, tokens),
      score: fuseScores.get(program.id) ?? 1,
      matchedTokens: matched,
      totalTokens: tokens.length,
      full: tokens.length === 0 || matched === tokens.length,
    }))
    .sort(
      (a, b) =>
        b.matchedTokens - a.matchedTokens ||
        a.tier - b.tier ||
        a.score - b.score ||
        a.item.name.localeCompare(b.item.name)
    )
    .map(({ item, matchedTokens, totalTokens, full }) => ({ item, matchedTokens, totalTokens, full }));
}

export function rankBySearchTerm<T extends Searchable & { id: string }>(programs: T[], term: string): T[] {
  return rankBySearchTermScored(programs, term).map((r) => r.item);
}
