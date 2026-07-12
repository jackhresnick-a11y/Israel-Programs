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

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** Public-safe program summary handed to the assistant -- deliberately excludes
 * contactEmail/contactPhone/adminNote/contactEmailSource. This is the only shape the
 * model ever sees or a client ever receives from the assistant route (see
 * app/api/assistant/route.ts), never a raw Program row. */
export type ProgramCandidate = {
  slug: string;
  name: string;
  location: string | null;
  durationType: DurationType;
  tags: string[];
  descriptionExcerpt: string;
};

export type RecommendationResult = {
  reply: string;
  /** Slugs the model chose to highlight. The caller (app/api/assistant/route.ts)
   * intersects this against the candidate list it sent before trusting it -- a
   * provider implementation must never be the sole guard against fabrication. */
  recommendedSlugs: string[];
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

  /** Conversational recommendation over a pre-fetched, live-DB candidate list
   * (see lib/programs.ts's listPrograms) -- must never recommend a program outside
   * `candidates` or invent a detail not present in them. */
  recommendPrograms(input: {
    message: string;
    history: ChatMessage[];
    candidates: ProgramCandidate[];
  }): Promise<RecommendationResult>;
}
