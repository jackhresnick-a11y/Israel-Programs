import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { bulkTranscriptsSchema, saveTranscriptsBulk, UnknownProgramSlugsError } from "@/lib/transcripts";

/** Admin-only: bulk-saves the .txt files matched at /admin/transcripts's multi-file
 * upload step. Every slug is re-resolved against the live Program table here -- the
 * client's own match is never trusted. Append-only: every entry always inserts a new
 * Transcript row, so there is nothing to confirm and nothing this route can silently
 * clobber. Nothing this route touches is public (raw transcript text is admin-only, see
 * CLAUDE.md), so there is deliberately no revalidateProgram call here. */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { entries } = bulkTranscriptsSchema.parse(await request.json());
    const result = await saveTranscriptsBulk(entries);
    return NextResponse.json({ ok: true, saved: result.saved });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof UnknownProgramSlugsError) {
      return NextResponse.json({ error: err.message, slugs: err.slugs }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save transcripts" }, { status: 500 });
  }
}
