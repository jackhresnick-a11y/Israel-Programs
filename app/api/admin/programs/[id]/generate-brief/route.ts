import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { getProgramVideoTranscript } from "@/lib/programs";
import { getAIProvider } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

/**
 * Admin-only: drafts a distilled brief from a program's raw video transcript via the
 * shared AIProvider (lib/ai/ -- same provider parseSearchQuery uses). Deliberately
 * read-only: this never writes Program.aiBrief itself. The admin's browser fills the
 * aiBrief textarea with the returned draft, which only reaches the database if/when
 * they separately press the existing Save button (PATCH .../video) -- see
 * generateBrief's doc comment on AIProvider for the fact-only/no-promotional-language
 * instruction given to the model.
 */
export async function POST(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  // This calls a paid external API (when AI_ENABLED), same posture as the assistant
  // route's rate limit -- keyed per admin here rather than per IP, since every caller
  // is already a known, authenticated admin.
  if (!checkRateLimit(`generate-brief:${check.userId}`, { limit: 10, windowMs: 10 * 60_000 })) {
    return NextResponse.json({ error: "Too many requests. Please wait a bit before trying again." }, { status: 429 });
  }

  const { id } = await params;

  const transcript = await getProgramVideoTranscript(id);
  if (!transcript || !transcript.trim()) {
    return NextResponse.json({ error: "This program has no transcript to generate a brief from." }, { status: 400 });
  }

  try {
    const brief = await getAIProvider().generateBrief(transcript);
    return NextResponse.json({ brief });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate a brief. Please try again." }, { status: 502 });
  }
}
