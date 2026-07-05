import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { DurationType } from "@/app/generated/prisma/enums";
import type { AIProvider, ParsedSearchQuery, ReviewSummary } from "./types";

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
}
