import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { getProgramTranscript, setProgramTranscript, transcriptEditSchema } from "@/lib/transcripts";

type Params = { params: Promise<{ id: string }> };

/** Admin-only: fetches one program's full transcript text, lazily -- only called when
 * an admin clicks Edit on a specific row in the /admin/transcripts list, so the full
 * text never rides along in that list's initial page load. */
export async function GET(_request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  const program = await getProgramTranscript(id);
  if (!program) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }
  return NextResponse.json(program);
}

/** Admin-only: edits one program's transcript text in place. */
export async function PATCH(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const { text } = transcriptEditSchema.parse(await request.json());
    await setProgramTranscript(id, text || null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update transcript" }, { status: 500 });
  }
}

/** Admin-only: clears one program's transcript (sets videoTranscript to null). The
 * confirm step lives client-side (this is a destructive field overwrite per CLAUDE.md's
 * database-write rule) -- the route itself just performs the write once asked. */
export async function DELETE(_request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    await setProgramTranscript(id, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to clear transcript" }, { status: 500 });
  }
}
