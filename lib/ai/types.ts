import type { DurationType } from "@/app/generated/prisma/enums";

export type ParsedSearchQuery = {
  q?: string;
  tag?: string;
  duration?: DurationType;
};

export type ReviewSummary = {
  summary: string;
  highlights: string[];
};

export type MatchReason = {
  facet: string;
  message: string;
};

/**
 * Every AI-powered surface in the app goes through this interface. The
 * NullProvider gives deterministic, non-AI answers; AnthropicProvider is the
 * real implementation. Swapping providers (via AI_ENABLED) never changes a
 * caller's contract.
 */
export interface AIProvider {
  /** Turn a free-text search query into structured filters. */
  parseSearchQuery(query: string): Promise<ParsedSearchQuery>;

  /** Summarize a program's reviews into a short digest + highlights. */
  summarizeReviews(reviews: { rating: number; text: string }[]): Promise<ReviewSummary>;

  /** Explain in prose why a program matches a set of quiz-derived reasons. */
  explainMatch(programName: string, reasons: string[]): Promise<string>;
}
