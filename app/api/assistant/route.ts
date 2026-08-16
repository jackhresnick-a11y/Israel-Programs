import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { getCurrentRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import { listPrograms, listAllTags } from "@/lib/programs";
import { rankPrograms, type RankableProgram } from "@/lib/flowRank";
import { validateParsedQuery, buildSearchCriteria, unmetLabels } from "@/lib/searchIntent";
import { getProgramPollSummary, getProgramReviewsSummary } from "@/lib/pollResults";
import { getAIProvider } from "@/lib/ai";
import type { ChatMessage, ProgramCandidate } from "@/lib/ai/types";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const MAX_CANDIDATES = 15;
const MAX_ALUMNI_QUOTES = 3;
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

type OutProgram = ProgramCandidate & { why: string; role: "pick" | "alternative" };

/** Approved review text only (PollReviewGroupDTO reviews + standalone reviews) -- both
 * already filtered to APPROVED-on-a-COUNTED-response by getProgramReviewsSummary, which
 * is the exact same function/gate the program page itself uses. Deliberately excludes
 * end-of-poll elaboration answers (a distinct feature) to keep this to what the request
 * actually calls "reviews." */
function extractAlumniQuotes(
  summary: Awaited<ReturnType<typeof getProgramReviewsSummary>>,
  limit: number
): string[] {
  const quotes: string[] = [];
  for (const group of summary.pollGroups) {
    for (const review of group.reviews) quotes.push(review.text);
  }
  for (const review of summary.standaloneReviews) quotes.push(review.text);
  return quotes.slice(0, limit);
}

function validateOut(
  items: { slug: string; [key: string]: unknown }[],
  candidateBySlug: Map<string, ProgramCandidate>,
  role: OutProgram["role"],
  textField: "why" | "line"
): OutProgram[] {
  return items
    .map((item) => {
      const candidate = candidateBySlug.get(item.slug);
      const text = typeof item[textField] === "string" ? (item[textField] as string) : undefined;
      return candidate && text ? { ...candidate, why: text, role } : null;
    })
    .filter((p): p is OutProgram => Boolean(p));
}

/**
 * Public-facing conversational program-recommendation endpoint. Gated the same way
 * the widget itself is hidden (admin always allowed; everyone else only when the
 * assistantEnabled SiteContent flag is "true") -- re-checked here, not just in the
 * UI, since a hidden button is not an access control.
 *
 * Retrieval is structured, not free-text: the message is parsed into facets (live tag
 * slugs + durations, see lib/searchIntent.ts) and every published program is SCORED
 * against them via lib/flowRank.ts's weighted "no hard cut" engine (the same ranking
 * rule find-v2-question-spec.md defines for /match) -- never filtered by a Prisma
 * `where` clause and never run through the free-text ranker. That makes an empty
 * result impossible except when the catalog itself has zero published programs: a
 * program missing every parsed facet still ranks, just last.
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

  // The live tag vocabulary (never a hardcoded list, per CLAUDE.md) and the full
  // published catalog -- the entire scoring pool, not a pre-filtered subset.
  const [vocab, pool] = await Promise.all([listAllTags(), listPrograms({})]);
  const tagCategoryBySlug = new Map(vocab.map((t) => [t.slug, t.category]));

  // Stage 1: turn the message into structured facets, constrained to the live
  // vocabulary (validateParsedQuery drops anything a provider might still return that
  // isn't a real, current tag slug -- defense in depth independent of the provider's
  // own enum constraint).
  const rawParsed = await getAIProvider().parseSearchQuery(message, vocab);
  const parsedQuery = validateParsedQuery(rawParsed, vocab);
  const criteria = buildSearchCriteria(parsedQuery, vocab);

  // Stage 2: score -- not filter -- every published program against those facets.
  // rankPrograms (lib/flowRank.ts) returns the FULL input array, ranked; it never
  // truncates or drops a program for missing a facet, so `scored` is empty only when
  // `pool` itself is empty.
  type MatchProgram = (typeof pool)[number] & RankableProgram;
  const matchPrograms: MatchProgram[] = pool.map((program) => ({
    ...program,
    tagSlugs: program.tags.map((t) => t.slug),
  }));
  const scored = rankPrograms(matchPrograms, criteria, tagCategoryBySlug);
  const topScored = scored.slice(0, MAX_CANDIDATES);

  // Enrichment: attach only already-public poll/review data to each of the top
  // candidates. getProgramPollSummary/getProgramReviewsSummary are the exact same
  // functions (same visible/published/approved-COUNTED gates) the program page itself
  // calls -- a below-threshold poll result or an unapproved review is never fetched
  // into this payload in the first place, so a provider has nothing to leak even if it
  // tried.
  const candidates: ProgramCandidate[] = await Promise.all(
    topScored.map(async (s) => {
      const program = s.program;
      const [pollSummary, reviewsSummary] = await Promise.all([
        getProgramPollSummary(program.id),
        getProgramReviewsSummary(program.id),
      ]);
      return {
        slug: program.slug,
        name: program.name,
        location: program.location,
        durationType: program.durationType,
        tags: program.tags.map((t) => t.name),
        descriptionExcerpt:
          program.description.length > DESCRIPTION_EXCERPT_LENGTH
            ? `${program.description.slice(0, DESCRIPTION_EXCERPT_LENGTH)}...`
            : program.description,
        unmetLabels: unmetLabels(s, criteria),
        bestForPhrases: pollSummary.bestForPhrases,
        alumniQuotes: extractAlumniQuotes(reviewsSummary, MAX_ALUMNI_QUOTES),
        aiBrief: program.aiBrief,
      };
    })
  );
  const candidateBySlug = new Map(candidates.map((c) => [c.slug, c]));

  // Stage 3: the AI (or NullProvider's deterministic fallback) picks 2 top picks + up
  // to 3 alternatives from `candidates` and explains each, honestly noting any
  // unmetLabels rather than glossing over them.
  const result = await getAIProvider().recommendPrograms({ message, history, candidates });

  // Defense in depth, independent of trusting the provider: drop anything that isn't
  // actually in this request's own candidate set before it ever reaches the client.
  const picks = validateOut(result.picks, candidateBySlug, "pick", "why");
  const alternatives = validateOut(result.alternatives, candidateBySlug, "alternative", "line");

  return NextResponse.json({ reply: result.reply, programs: [...picks, ...alternatives] });
}
