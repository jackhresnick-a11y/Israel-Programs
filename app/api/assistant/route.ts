import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { getCurrentRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import { listPrograms } from "@/lib/programs";
import { getAIProvider } from "@/lib/ai";
import type { ChatMessage, ProgramCandidate } from "@/lib/ai/types";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const MAX_CANDIDATES = 15;
const DESCRIPTION_EXCERPT_LENGTH = 200;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      })
    )
    .max(20)
    .optional(),
});

/**
 * Public-facing conversational program-recommendation endpoint. Gated the same way
 * the widget itself is hidden (admin always allowed; everyone else only when the
 * assistantEnabled SiteContent flag is "true") -- re-checked here, not just in the
 * UI, since a hidden button is not an access control.
 *
 * Two-stage design: stage 1 is the exact same lib/programs.ts search every /programs
 * request uses (a live DB query, never a snapshot), stage 2 is the AI layer choosing
 * among only those results. See lib/ai/types.ts's ProgramCandidate/RecommendationResult
 * for why this can't fabricate a program.
 */
export async function POST(request: Request) {
  const [role, assistantEnabled] = await Promise.all([
    getCurrentRole(),
    getSiteContent("assistantEnabled"),
  ]);
  if (role !== "admin" && assistantEnabled !== "true") {
    return NextResponse.json({ error: "Assistant is not enabled" }, { status: 403 });
  }

  // This calls a paid external API (when AI_ENABLED), so it gets a materially
  // tighter window than the leads/analytics precedent elsewhere in the app.
  const ip = getClientIp(request);
  if (!checkRateLimit(`assistant:${ip}`, { limit: 20, windowMs: 10 * 60_000 })) {
    return NextResponse.json({ error: "Too many requests. Please try again in a few minutes." }, { status: 429 });
  }

  let message: string;
  let history: ChatMessage[];
  try {
    const parsed = bodySchema.parse(await request.json());
    message = parsed.message;
    history = parsed.history ?? [];
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Stage 1: the exact same live search /programs uses. Never a cached/stale list --
  // this is the structural guarantee that stage 2 can only ever choose among programs
  // that are actually published right now.
  const searchResults = await listPrograms({ q: message });
  const candidates: ProgramCandidate[] = searchResults.slice(0, MAX_CANDIDATES).map((program) => ({
    slug: program.slug,
    name: program.name,
    location: program.location,
    durationType: program.durationType,
    tags: program.tags.map((t) => t.name),
    descriptionExcerpt:
      program.description.length > DESCRIPTION_EXCERPT_LENGTH
        ? `${program.description.slice(0, DESCRIPTION_EXCERPT_LENGTH)}...`
        : program.description,
  }));
  const candidateBySlug = new Map(candidates.map((c) => [c.slug, c]));

  // Stage 2: AI (or NullProvider's deterministic fallback) picks/explains among
  // `candidates` only.
  const result = await getAIProvider().recommendPrograms({ message, history, candidates });

  // Defense in depth, independent of trusting the provider: drop anything that
  // isn't actually in this request's own candidate set before it ever reaches the
  // client. AnthropicProvider's zod schema already constrains this at the SDK-parse
  // layer, but this check doesn't rely on that holding -- a future provider or a
  // change to that schema could regress it, and this route would still be safe.
  const validatedPrograms = result.recommendedSlugs
    .map((slug) => candidateBySlug.get(slug))
    .filter((c): c is ProgramCandidate => Boolean(c));

  return NextResponse.json({ reply: result.reply, programs: validatedPrograms });
}
