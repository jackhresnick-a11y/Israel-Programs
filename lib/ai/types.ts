import type { DurationType } from "@/app/generated/prisma/enums";

/** The live tag vocabulary parseSearchQuery must be given -- never a hardcoded list
 * (CLAUDE.md: "never introduce new tag values, casing variants, or spellings").
 * Structurally compatible with a plain `prisma.tag.findMany()` row, so a caller can
 * pass `listAllTags()`'s result directly. Defined here (not lib/searchIntent.ts, which
 * imports ParsedSearchQuery from this file) to avoid a circular type import. */
export type TagVocabEntry = { slug: string; name: string; category: string | null };

export type ParsedSearchQuery = {
  q?: string;
  /** Live Tag.slug values implied by the message -- plural, since a real request
   * ("tech internship + religious + gap year") routinely names several independent
   * facets at once. A single slug could never express that. Re-validated against the
   * live tag table before use (see lib/searchIntent.ts's validateParsedQuery); never
   * pushed into a Prisma `where` clause directly (see app/api/assistant/route.ts) --
   * doing so would just relocate the old "one unmet filter zeroes everything" bug from
   * text search into a hard AND filter over tags. */
  tags?: string[];
  /** Plural for the same reason -- "summer or gap year" implies two acceptable
   * durations, not one. */
  duration?: DurationType[];
};

export type ReviewSummary = {
  summary: string;
  highlights: string[];
};

export type MatchReason = {
  facet: string;
  message: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** Public-safe program summary handed to the assistant -- deliberately excludes
 * contactEmail/contactPhone/adminNote/contactEmailSource. This is the only shape the
 * model ever sees or a client ever receives from the assistant route (see
 * app/api/assistant/route.ts), never a raw Program row.
 *
 * `bestForPhrases` and `alumniQuotes` are the ONLY poll/review data ever handed to the
 * assistant, and both are pre-filtered by the caller to already-public data before
 * this object is built -- bestForPhrases only from questions that have crossed
 * `getProgramPollSummary`'s `visible && published` gate, alumniQuotes only from
 * APPROVED reviews on a COUNTED response (`getProgramReviewsSummary`). A provider must
 * never be handed, and can therefore never leak, a below-threshold rating or an
 * unapproved review. `alumniQuotes` is named (not `reviews`) specifically so a
 * provider's prompt is forced to frame it as "alumni describe it as...", never restate
 * it as fact about the program. */
export type ProgramCandidate = {
  slug: string;
  name: string;
  location: string | null;
  durationType: DurationType;
  tags: string[];
  descriptionExcerpt: string;
  /** Which of the message's parsed constraints this candidate does NOT satisfy, in
   * plain language (see lib/searchIntent.ts's unmetLabels). Empty for a full match. A
   * provider must state these plainly rather than silently omit them. */
  unmetLabels: string[];
  /** Published "Best for" phrases (lib/pollBestFor.ts), already gated public. */
  bestForPhrases: string[];
  /** Approved alumni review text on a COUNTED response, already gated public. */
  alumniQuotes: string[];
};

/** Everything the reply says about why this candidate fits must be traceable to
 * `sourceProgram` -- the enriched ProgramCandidate this pick/alternative was chosen
 * from (never a fact invented beyond it). See app/api/assistant/route.ts's enrichment
 * step for what's actually allowed into a candidate's payload. */
export type RecommendationPick = {
  slug: string;
  /** 1-2 sentences on why this fits -- may cite name/tags/org/location/description,
   * a published bestForPhrase, or an approved alumni quote (framed as alumni opinion,
   * never restated as fact). Must state plainly which parts of the request, if any,
   * this candidate doesn't meet (see unmetLabels in lib/searchIntent.ts). */
  why: string;
};

export type RecommendationAlternative = {
  slug: string;
  /** One short line -- same sourcing rules as RecommendationPick.why, just terser. */
  line: string;
};

export type RecommendationResult = {
  reply: string;
  /** Up to 2 top picks with a short "why," most relevant first. Empty only when the
   * candidate list itself was empty (see app/api/assistant/route.ts -- candidates come
   * from `rankPrograms`, which returns every published program ranked, so this is
   * empty only if the catalog has zero published programs). */
  picks: RecommendationPick[];
  /** Up to 3 alternatives, terser than picks. */
  alternatives: RecommendationAlternative[];
  /** Slugs the model chose to highlight (picks + alternatives, deduped). The caller
   * (app/api/assistant/route.ts) intersects this against the candidate list it sent
   * before trusting it -- a provider implementation must never be the sole guard
   * against fabrication. */
  recommendedSlugs: string[];
};

/**
 * Every AI-powered surface in the app goes through this interface. The
 * NullProvider gives deterministic, non-AI answers; AnthropicProvider is the
 * real implementation. Swapping providers (via AI_ENABLED) never changes a
 * caller's contract.
 */
export interface AIProvider {
  /** Turn a free-text search query into structured filters (live Tag slugs +
   * DurationType values), constrained to `vocab` -- the assistant route
   * (app/api/assistant/route.ts) scores every published program against these via
   * lib/flowRank.ts rather than pushing them into a Prisma `where` clause, so an
   * unmatched facet demotes a program instead of eliminating it. */
  parseSearchQuery(query: string, vocab: TagVocabEntry[]): Promise<ParsedSearchQuery>;

  /** Summarize a program's reviews into a short digest + highlights. */
  summarizeReviews(reviews: { rating: number; text: string }[]): Promise<ReviewSummary>;

  /** Explain in prose why a program matches a set of quiz-derived reasons. */
  explainMatch(programName: string, reasons: string[]): Promise<string>;

  /** Conversational recommendation over a pre-fetched, live-DB candidate list
   * (see lib/programs.ts's listPrograms) -- must never recommend a program outside
   * `candidates` or invent a detail not present in them. */
  recommendPrograms(input: {
    message: string;
    history: ChatMessage[];
    candidates: ProgramCandidate[];
  }): Promise<RecommendationResult>;
}
