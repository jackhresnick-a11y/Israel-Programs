import type { DurationType } from "@/app/generated/prisma/enums";
import type {
  AIProvider,
  ChatMessage,
  ParsedSearchQuery,
  ProgramCandidate,
  RecommendationResult,
  ReviewSummary,
} from "./types";

const DURATION_KEYWORDS: Record<string, DurationType> = {
  "10 day": "TEN_DAY",
  "10-day": "TEN_DAY",
  summer: "SUMMER",
  semester: "SEMESTER",
  "gap year": "GAP_YEAR",
  yeshiva: "GAP_YEAR",
  seminary: "GAP_YEAR",
};

/**
 * Deterministic, non-AI fallback. Every method here must work with zero
 * network calls so the app functions identically whether AI is on or off.
 */
export class NullProvider implements AIProvider {
  async parseSearchQuery(query: string): Promise<ParsedSearchQuery> {
    const tagMatch = query.match(/#([a-z0-9-]+)/i);
    const tag = tagMatch?.[1]?.toLowerCase();

    const lower = query.toLowerCase();
    const durationEntry = Object.entries(DURATION_KEYWORDS).find(([kw]) => lower.includes(kw));
    const duration = durationEntry?.[1];

    const q = query
      .replace(/#[a-z0-9-]+/gi, "")
      .trim();

    return {
      q: q || undefined,
      tag,
      duration,
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

  /** No network call -- the candidates are already a live-DB search result (see
   * app/api/assistant/route.ts's stage 1), so surfacing the top few verbatim with a
   * templated reply is a legitimate (if unconversational) answer, not a placeholder. */
  async recommendPrograms(input: {
    message: string;
    history: ChatMessage[];
    candidates: ProgramCandidate[];
  }): Promise<RecommendationResult> {
    const top = input.candidates.slice(0, 5);
    if (top.length === 0) {
      return {
        reply: "I couldn't find any programs matching that. Try describing what you're looking for differently.",
        recommendedSlugs: [],
      };
    }
    return {
      reply:
        top.length === 1
          ? "Here is 1 program matching your search:"
          : `Here are ${top.length} programs matching your search:`,
      recommendedSlugs: top.map((c) => c.slug),
    };
  }
}
