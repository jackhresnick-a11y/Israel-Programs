import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getConcatenatedTranscript, saveBriefDraft } from "@/lib/briefs";
import { joinTranscripts } from "@/lib/briefsShared";
import { getAIProvider } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * Admin-only: drafts one program's brief of one type via the shared AIProvider (lib/ai/
 * -- same provider parseSearchQuery/recommendPrograms use), using that BriefType's own
 * stored promptText -- never a hardcoded instruction (see lib/ai/anthropic-provider.ts's
 * generateBrief). Same input as the copy-to-clipboard button (buildCopyPayload), so the
 * AI draft and a hand-pasted one are always answering the same question. Unlike the
 * removed .../generate-brief route this replaces, this DOES write -- straight into
 * lib/briefs.ts's saveBriefDraft, same as the manual paste path, landing as a DRAFT
 * (never PUBLISHED) with an exact "INSUFFICIENT" response handled identically to a
 * hand-pasted one. Disabled when the program has no transcripts.
 */
export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const programId = String(body.programId ?? "");
  const briefTypeId = String(body.briefTypeId ?? "");
  if (!programId || !briefTypeId) {
    return NextResponse.json({ error: "programId and briefTypeId are required" }, { status: 400 });
  }

  const briefType = await prisma.briefType.findUnique({ where: { id: briefTypeId } });
  if (!briefType) {
    return NextResponse.json({ error: "Brief type not found" }, { status: 404 });
  }

  const transcripts = await getConcatenatedTranscript(programId);
  if (transcripts.length === 0) {
    return NextResponse.json({ error: "This program has no transcripts to generate a brief from." }, { status: 400 });
  }

  try {
    const transcriptText = joinTranscripts(transcripts);
    const draft = await getAIProvider().generateBrief(briefType.promptText, transcriptText);
    const result = await saveBriefDraft(programId, briefTypeId, draft);
    return NextResponse.json({ ok: true, insufficient: result.insufficient, brief: result.brief });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate a brief. Please try again." }, { status: 502 });
  }
}
