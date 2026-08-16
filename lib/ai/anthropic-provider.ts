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
  TagVocabEntry,
} from "./types";

/**
 * Model tiers are deliberately split per the product spec (docs/PRODUCT_SPEC.md
 * §12.3): Haiku for cheap/high-volume parsing and summarization, Sonnet for
 * reasoning-heavy match explanations. Override via env if you want everything
 * on one model.
 */
const FAST_MODEL = process.env.AI_MODEL_FAST ?? "claude-haiku-4-5";
const REASONING_MODEL = process.env.AI_MODEL_REASONING ?? "claude-sonnet-5";

const reviewSummarySchema = z.object({
  summary: z.string().describe("One or two sentence digest of what alumni say overall"),
  highlights: z.array(z.string()).max(3).describe("Up to 3 short representative quotes or paraphrases"),
});

export class AnthropicProvider implements AIProvider {
  private client = new Anthropic();

  /**
   * `vocab` is baked into both the zod schema (tags is a z.enum() of exactly this
   * request's live tag slugs, mirroring how recommendPrograms already enum-constrains
   * recommendedSlugs below -- Claude's structured output literally cannot name a slug
   * outside the given vocabulary) and the prompt. app/api/assistant/route.ts
   * re-validates the result against the live tag table regardless (see
   * lib/searchIntent.ts's validateParsedQuery) -- this method's constraint is
   * defense-in-depth, not the only guard.
   */
  async parseSearchQuery(query: string, vocab: TagVocabEntry[]): Promise<ParsedSearchQuery> {
    const tagSlugs = vocab.map((t) => t.slug);
    const tagsField =
      tagSlugs.length > 0
        ? z.array(z.enum(tagSlugs as [string, ...string[]]))
        : z.array(z.never());

    const searchQuerySchema = z.object({
      q: z.string().optional().describe("Free-text leftover not already captured by tags/duration"),
      tags: tagsField
        .optional()
        .describe(
          "Zero or more tag slugs implied by the message -- ONLY from the TAGS list in the system prompt, never invented. A message can imply several at once (e.g. a tech tag AND a religious-affiliation tag AND a gap-year duration) -- include all that apply, don't pick just one."
        ),
      duration: z
        .array(z.enum(DurationType))
        .optional()
        .describe("Zero or more acceptable durations -- a message can accept more than one."),
    });

    const vocabBlock = vocab.map((t) => `${t.slug} (${t.name})`).join("\n");

    const response = await this.client.messages.parse({
      model: FAST_MODEL,
      max_tokens: 1024,
      system:
        "Convert the user's natural-language search into structured filters for an Israel-programs directory. " +
        "A single message routinely implies several independent facets at once (e.g. a topic tag, a religious-" +
        "affiliation tag, and a duration) -- extract all of them, not just the first one you notice. Only use " +
        "tag slugs from the TAGS list below; never invent one. Leave a field unset if nothing is implied.\n\n" +
        `TAGS (slug (name)):\n${vocabBlock}`,
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
   * Recommends only from `input.candidates` -- every published program, ranked by how
   * many parsed facets it matches (see app/api/assistant/route.ts), never a filtered or
   * possibly-empty search result. Three independent layers keep this from fabricating a
   * program or an attribute:
   *   1. The zod schema's pick/alternative slugs are a z.enum() of exactly this
   *      request's candidate slugs, so Claude's structured output literally cannot name
   *      a slug outside the given set.
   *   2. The caller re-validates the returned slugs against its own candidate list
   *      before responding to the client, independent of trusting this method.
   *   3. Every fact a candidate carries (tags/location/description/bestForPhrases/
   *      alumniQuotes) was ALREADY filtered to public-safe data before this method ever
   *      saw it (see ProgramCandidate's doc comment) -- the system prompt additionally
   *      instructs Claude never to invent a detail beyond it and to frame alumniQuotes
   *      as alumni opinion, never restated as fact.
   * candidates is never empty in practice (rankPrograms returns the whole catalog), so
   * there is no "couldn't find any" case -- the empty branch below only guards the
   * theoretical zero-published-programs state.
   */
  async recommendPrograms(input: {
    message: string;
    history: ChatMessage[];
    candidates: ProgramCandidate[];
  }): Promise<RecommendationResult> {
    if (input.candidates.length === 0) {
      return {
        reply: "There are no published programs in the directory right now.",
        picks: [],
        alternatives: [],
        recommendedSlugs: [],
      };
    }

    const candidateSlugs = input.candidates.map((c) => c.slug) as [string, ...string[]];
    const slugEnum = z.enum(candidateSlugs);
    const recommendationSchema = z.object({
      reply: z
        .string()
        .describe(
          "A warm, concise conversational reply (2-4 sentences) introducing the picks/alternatives below. " +
            "If nothing fits every part of the request, say so plainly and note that the results below are the " +
            "closest available rather than a perfect match."
        ),
      picks: z
        .array(z.object({ slug: slugEnum, why: z.string().describe("1-2 sentences on why this fits") }))
        .max(2)
        .describe(
          "The 2 best-matching candidates, most relevant first. Each `why` must be traceable to that " +
            "candidate's own listed data and must plainly state any of its unmetLabels."
        ),
      alternatives: z
        .array(z.object({ slug: slugEnum, line: z.string().describe("One short line on why this fits") }))
        .max(3)
        .describe("Up to 3 more candidates worth a look, terser than picks, same sourcing rules."),
    });

    const candidateBlock = input.candidates
      .map((c) => {
        const lines = [
          `- slug: ${c.slug} | name: ${c.name} | location: ${c.location ?? "unknown"} | duration: ${c.durationType} | tags: ${c.tags.join(", ") || "none"} | description: ${c.descriptionExcerpt}`,
        ];
        if (c.unmetLabels.length > 0) lines.push(`  does NOT match: ${c.unmetLabels.join(", ")}`);
        if (c.aiBrief) lines.push(`  brief: ${c.aiBrief}`);
        if (c.bestForPhrases.length > 0) lines.push(`  published "best for": ${c.bestForPhrases.join("; ")}`);
        if (c.alumniQuotes.length > 0) lines.push(`  approved alumni review quotes: ${c.alumniQuotes.map((q) => `"${q}"`).join(" / ")}`);
        return lines.join("\n");
      })
      .join("\n");

    const response = await this.client.messages.parse({
      model: REASONING_MODEL,
      max_tokens: 1536,
      system:
        "You are a helpful assistant for Israel Programs Wiki, a directory of Israel gap-year/study/volunteer programs for Jewish young adults. " +
        "You may ONLY recommend programs from the CANDIDATES list below -- never invent a program, name, detail, or attribute that isn't given there. " +
        "CANDIDATES are pre-ranked by how many parts of the request they match; always pick your picks/alternatives from earlier in the list when quality is comparable, never skip ahead to a worse-matching candidate for variety. " +
        "Every candidate that doesn't fully satisfy the request still lists what it's missing under 'does NOT match' -- you MUST state that plainly in your why/line for that candidate, never omit it or gloss over it. " +
        "Never claim a program is a full match if it has any 'does NOT match' entries. " +
        "'brief' is an admin-authored public summary of the program -- you may state it as fact about the program. " +
        "'published \"best for\"' lines are already-public aggregate results -- you may state them as fact about the program. " +
        "'approved alumni review quotes' are individual opinions, not facts about the program -- you MUST frame any use of them as \"alumni describe it as...\" or similar, never restate a quote as a plain fact. " +
        "Always return exactly 2 picks and up to 3 alternatives from the candidates given (fewer only if there are literally fewer than 5 candidates total) -- there is always something to show, even if it's an imperfect match; never respond as if nothing was found.\n\n" +
        `CANDIDATES (pre-ranked, best match first):\n${candidateBlock}`,
      messages: [
        ...input.history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user" as const, content: input.message },
      ],
      output_config: { format: zodOutputFormat(recommendationSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      return { reply: "Sorry, I had trouble finding a match. Could you rephrase?", picks: [], alternatives: [], recommendedSlugs: [] };
    }
    const recommendedSlugs = Array.from(new Set([...parsed.picks.map((p) => p.slug), ...parsed.alternatives.map((a) => a.slug)]));
    return { reply: parsed.reply, picks: parsed.picks, alternatives: parsed.alternatives, recommendedSlugs };
  }

  /**
   * A short, explicit timeout (rather than the SDK's 10-minute default) so a stuck
   * request surfaces as a clear error near the admin's "Generate from transcript"
   * button instead of hanging indefinitely -- see app/api/admin/programs/[id]/
   * generate-brief/route.ts, which turns any rejection here into a surfaced 502.
   */
  async generateBrief(transcript: string): Promise<string> {
    const response = await this.client.messages.create(
      {
        model: FAST_MODEL,
        max_tokens: 400,
        system:
          "The following is a raw transcript of a study/gap-year/volunteer program's own self-shot video. " +
          "Extract a short, factual brief from it for a program directory listing. These videos routinely mix " +
          "real facts with promotional or sales language (e.g. \"this will change your life\", \"you won't " +
          "regret it\") -- extract ONLY concrete facts stated in the transcript and discard every promotional " +
          "or persuasive sentence entirely. Cover, whenever the transcript actually states them: location, " +
          "program duration, languages of instruction, participant age range, and what a typical day looks " +
          "like. Never invent or infer a fact the transcript doesn't state. Write flowing prose (no bullet " +
          "points, no headers), roughly 60-100 words.",
        messages: [{ role: "user", content: transcript }],
      },
      { timeout: 30_000 }
    );
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text.trim() ?? "";
  }
}
