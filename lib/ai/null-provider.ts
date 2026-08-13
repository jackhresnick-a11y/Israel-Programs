import { matchTagVocabulary, parseDurationKeywords } from "@/lib/searchIntent";
import type {
  AIProvider,
  ChatMessage,
  ParsedSearchQuery,
  ProgramCandidate,
  RecommendationResult,
  ReviewSummary,
  TagVocabEntry,
} from "./types";

/**
 * Deterministic, non-AI fallback. Every method here must work with zero
 * network calls so the app functions identically whether AI is on or off.
 */
export class NullProvider implements AIProvider {
  async parseSearchQuery(query: string, vocab: TagVocabEntry[]): Promise<ParsedSearchQuery> {
    // "#slug" is still honored as an explicit, direct tag reference (unvalidated here --
    // app/api/assistant/route.ts's validateParsedQuery drops anything not a real live
    // slug) alongside phrase-matching the message against the live tag vocabulary.
    const hashtagSlugs = Array.from(query.matchAll(/#([a-z0-9-]+)/gi)).map((m) => m[1].toLowerCase());
    const vocabSlugs = matchTagVocabulary(query, vocab);
    const tags = Array.from(new Set([...hashtagSlugs, ...vocabSlugs]));

    const duration = parseDurationKeywords(query);
    const q = query.replace(/#[a-z0-9-]+/gi, "").trim();

    return {
      q: q || undefined,
      tags: tags.length > 0 ? tags : undefined,
      duration: duration.length > 0 ? duration : undefined,
    };
  }

  async summarizeReviews(reviews: { rating: number; text: string }[]): Promise<ReviewSummary> {
    if (reviews.length === 0) {
      return { summary: "No reviews yet.", highlights: [] };
    }

    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    const highlights = [...reviews]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3)
      .map((r) => (r.text.length > 140 ? `${r.text.slice(0, 137)}...` : r.text));

    return {
      summary: `Averaging ${avg.toFixed(1)}/5 across ${reviews.length} review${reviews.length === 1 ? "" : "s"}.`,
      highlights,
    };
  }

  async explainMatch(programName: string, reasons: string[]): Promise<string> {
    if (reasons.length === 0) {
      return `${programName} matches your basic criteria.`;
    }
    return `${programName} matches because: ${reasons.join("; ")}.`;
  }

  /** Templated, not generative -- every sentence is built directly from fields already
   * on the candidate (see ProgramCandidate's doc comment for what's allowed in), so
   * there's nothing here that could invent a detail. unmetLabels is stated plainly
   * rather than omitted, per the "never hard-cut, say what's missing" requirement. */
  private describeCandidate(c: ProgramCandidate): string {
    const parts: string[] = [];
    if (c.location) parts.push(`located in ${c.location}`);
    if (c.tags.length > 0) parts.push(`tagged ${c.tags.slice(0, 3).join(", ")}`);
    if (c.bestForPhrases.length > 0) parts.push(`best for ${c.bestForPhrases[0]}`);
    if (c.alumniQuotes.length > 0) parts.push(`alumni describe it as: "${c.alumniQuotes[0]}"`);

    let sentence = parts.length > 0 ? `${c.name} -- ${parts.join("; ")}.` : `${c.name}.`;
    if (c.unmetLabels.length > 0) {
      sentence += ` Doesn't match: ${c.unmetLabels.join(", ")}.`;
    }
    return sentence;
  }

  /** No network call -- `candidates` is already the full published catalog, ranked by
   * how many of the message's parsed facets each program matches (see
   * app/api/assistant/route.ts). Always non-empty unless the catalog itself has zero
   * published programs, so there is no "couldn't find any" case to handle here. */
  async recommendPrograms(input: {
    message: string;
    history: ChatMessage[];
    candidates: ProgramCandidate[];
  }): Promise<RecommendationResult> {
    const { candidates } = input;
    if (candidates.length === 0) {
      return {
        reply: "There are no published programs in the directory right now.",
        picks: [],
        alternatives: [],
        recommendedSlugs: [],
      };
    }

    const picks = candidates.slice(0, 2).map((c) => ({ slug: c.slug, why: this.describeCandidate(c) }));
    const alternatives = candidates.slice(2, 5).map((c) => ({ slug: c.slug, line: this.describeCandidate(c) }));
    const shown = [...picks, ...alternatives];
    const anyUnmet = candidates.slice(0, 5).some((c) => c.unmetLabels.length > 0);

    const reply = anyUnmet
      ? "Here's the closest match I found -- some don't fully match every part of your search, noted below."
      : `Here ${shown.length === 1 ? "is" : "are"} what I found matching your search:`;

    return { reply, picks, alternatives, recommendedSlugs: shown.map((p) => p.slug) };
  }
}
