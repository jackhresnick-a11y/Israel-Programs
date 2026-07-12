import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { DurationType } from "@/app/generated/prisma/enums";
import type {
  AIProvider,
  ChatMessage,
  ParsedSearchQuery,
  ProgramCandidate,
  RecommendationResult,
  ReviewSummary,
} from "./types";

/**
 * Model tiers are deliberately split per the product spec (docs/PRODUCT_SPEC.md
 * §12.3): Haiku for cheap/high-volume parsing and summarization, Sonnet for
 * reasoning-heavy match explanations. Override via env if you want everything
 * on one model.
 */
const FAST_MODEL = process.env.AI_MODEL_FAST ?? "claude-haiku-4-5";
const REASONING_MODEL = process.env.AI_MODEL_REASONING ?? "claude-sonnet-5";

const searchQuerySchema = z.object({
  q: z.string().optional().describe("Free-text keyword to match against name/description/organization"),
  tag: z.string().optional().describe("A single hashtag/tag slug, lowercase, hyphenated, no leading #"),
  duration: z.enum(DurationType).optional(),
});

const reviewSummarySchema = z.object({
  summary: z.string().describe("One or two sentence digest of what alumni say overall"),
  highlights: z.array(z.string()).max(3).describe("Up to 3 short representative quotes or paraphrases"),
});

export class AnthropicProvider implements AIProvider {
  private client = new Anthropic();

  async parseSearchQuery(query: string): Promise<ParsedSearchQuery> {
    const response = await this.client.messages.parse({
      model: FAST_MODEL,
      max_tokens: 1024,
      system:
        "Convert the user's natural-language search into structured filters for an Israel-programs directory. Leave fields unset if not implied.",
      messages: [{ role: "user", content: query }],
      output_config: { format: zodOutputFormat(searchQuerySchema) },
    });
    return response.parsed_output ?? {};
  }

  async summarizeReviews(reviews: { rating: number; text: string }[]): Promise<ReviewSummary> {
    if (reviews.length === 0) {
      return { summary: "No reviews yet.", highlights: [] };
    }

    const reviewText = reviews
      .map((r, i) => `Review ${i + 1} (${r.rating}/5): ${r.text}`)
      .join("\n\n");

    const response = await this.client.messages.parse({
      model: FAST_MODEL,
      max_tokens: 1024,
      system: "Summarize these alumni reviews of a study/gap-year program factually. Do not invent details.",
      messages: [{ role: "user", content: reviewText }],
      output_config: { format: zodOutputFormat(reviewSummarySchema) },
    });
    return response.parsed_output ?? { summary: "", highlights: [] };
  }

  async explainMatch(programName: string, reasons: string[]): Promise<string> {
    const response = await this.client.messages.create({
      model: REASONING_MODEL,
      max_tokens: 512,
      system:
        "Explain in 2-3 warm, specific sentences why a program matches a prospective participant, given the listed reasons. Do not invent facts beyond the reasons given.",
      messages: [
        {
          role: "user",
          content: `Program: ${programName}\nReasons it matches: ${reasons.join("; ")}`,
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text ?? `${programName} matches your preferences.`;
  }

  /**
   * Recommends only from `input.candidates` -- a live-DB search result the caller
   * (app/api/assistant/route.ts) fetched via lib/programs.ts's listPrograms, never a
   * snapshot. Two independent layers keep this from fabricating a program:
   *   1. The zod schema's recommendedSlugs is a z.enum() of exactly this request's
   *      candidate slugs, so Claude's structured output literally cannot name a slug
   *      outside the given set -- the SDK's own parse would reject it.
   *   2. The caller re-validates the returned slugs against its own candidate list
   *      before responding to the client, independent of trusting this method.
   * The system prompt additionally instructs Claude never to invent a detail not
   * present in the candidate data, for the free-text `reply` (which structural
   * validation can't constrain the way it can a slug enum).
   */
  async recommendPrograms(input: {
    message: string;
    history: ChatMessage[];
    candidates: ProgramCandidate[];
  }): Promise<RecommendationResult> {
    if (input.candidates.length === 0) {
      return {
        reply: "I couldn't find any programs matching that. Try describing what you're looking for differently.",
        recommendedSlugs: [],
      };
    }

    const candidateSlugs = input.candidates.map((c) => c.slug) as [string, ...string[]];
    const recommendationSchema = z.object({
      reply: z
        .string()
        .describe(
          "A warm, concise conversational reply (2-4 sentences) recommending programs from the candidate list. If none fit well, say so honestly. If the request is too vague to narrow down, ask a brief clarifying question instead of guessing."
        ),
      recommendedSlugs: z
        .array(z.enum(candidateSlugs))
        .max(5)
        .describe("Slugs of the best-matching candidates, most relevant first. Empty if nothing fits or you're asking a clarifying question."),
    });

    const candidateBlock = input.candidates
      .map(
        (c) =>
          `- slug: ${c.slug} | name: ${c.name} | location: ${c.location ?? "unknown"} | duration: ${c.durationType} | tags: ${c.tags.join(", ") || "none"} | description: ${c.descriptionExcerpt}`
      )
      .join("\n");

    const response = await this.client.messages.parse({
      model: REASONING_MODEL,
      max_tokens: 1024,
      system:
        "You are a helpful assistant for Israel Programs Wiki, a directory of Israel gap-year/study/volunteer programs for Jewish young adults. " +
        "You may ONLY recommend programs from the CANDIDATES list below -- never invent a program, name, detail, or attribute that isn't given there. " +
        "If none of the candidates fit well, say so honestly rather than forcing a match. " +
        "If the user's request is too vague to narrow down, ask a brief clarifying question instead of guessing.\n\n" +
        `CANDIDATES:\n${candidateBlock}`,
      messages: [
        ...input.history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user" as const, content: input.message },
      ],
      output_config: { format: zodOutputFormat(recommendationSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      return { reply: "Sorry, I had trouble finding a match. Could you rephrase?", recommendedSlugs: [] };
    }
    return { reply: parsed.reply, recommendedSlugs: parsed.recommendedSlugs };
  }
}
