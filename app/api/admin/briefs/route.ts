import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { getConcatenatedTranscript, getProgramBriefsForAdmin, briefDraftSchema, saveBriefDraft } from "@/lib/briefs";

/** Admin-only: one program's transcripts and briefs side by side, for /admin/briefs'
 * picker. Deliberately returns full transcript text (unlike /admin/transcripts' list
 * view) -- this route is the source for the copy-payload button, which needs the actual
 * text, and it's only ever requested for one admin-selected program at a time, never a
 * whole-catalog list. */
export async function GET(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const programId = new URL(request.url).searchParams.get("programId");
  if (!programId) {
    return NextResponse.json({ error: "programId is required" }, { status: 400 });
  }

  const [transcripts, briefs] = await Promise.all([
    getConcatenatedTranscript(programId),
    getProgramBriefsForAdmin(programId),
  ]);
  return NextResponse.json({ transcripts, briefs });
}

/** Admin-only: saves (or upserts) a draft for one (program, brief type) slot. Never
 * publishes -- see lib/briefs.ts's saveBriefDraft. An exact INSUFFICIENT paste is
 * reported back as `insufficient: true` rather than an error, since it's a valid,
 * meaningful save (a durable flag), not a rejected request. */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const body = await request.json();
    const programId = String(body.programId ?? "");
    const briefTypeId = String(body.briefTypeId ?? "");
    if (!programId || !briefTypeId) {
      return NextResponse.json({ error: "programId and briefTypeId are required" }, { status: 400 });
    }
    const { text } = briefDraftSchema.parse(body);
    const result = await saveBriefDraft(programId, briefTypeId, text);
    return NextResponse.json({ ok: true, insufficient: result.insufficient, brief: result.brief });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Brief type not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save brief" }, { status: 500 });
  }
}
