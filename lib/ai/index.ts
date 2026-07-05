import { NullProvider } from "./null-provider";
import { AnthropicProvider } from "./anthropic-provider";
import type { AIProvider } from "./types";

export type { AIProvider, ParsedSearchQuery, ReviewSummary, MatchReason } from "./types";

let cached: AIProvider | undefined;

/**
 * AI is OFF by default. Set AI_ENABLED=true (and ANTHROPIC_API_KEY) in
 * .env.local to switch every AI-powered surface in the app over to Claude —
 * no other code changes required, since every caller only ever talks to the
 * AIProvider interface.
 */
export function isAIEnabled(): boolean {
  return process.env.AI_ENABLED === "true";
}

export function getAIProvider(): AIProvider {
  if (cached) return cached;

  if (!isAIEnabled()) {
    cached = new NullProvider();
    return cached;
  }

  cached = new AnthropicProvider();
  return cached;
}
