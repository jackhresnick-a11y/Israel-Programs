import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { setProgramVideoFields } from "@/lib/programs";
import { revalidateProgram } from "@/lib/revalidate";

type Params = { params: Promise<{ id: string }> };

// Same http(s)-only discipline as lib/programs.ts's httpUrl -- a submitted link can
// never execute script or render as an inline resource when clicked.
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), { message: "Must be a valid http(s) URL" });

// videoTranscript and aiBrief used to be edited here too -- both write paths are gone
// now that transcripts are Transcript rows (/admin/transcripts) and public summaries
// are ProgramBrief rows (/admin/briefs). Program.videoTranscript/aiBrief are kept as
// columns (see their doc comments in schema.prisma) but this route no longer touches
// either, so /admin/briefs isn't competing with a second place to write the same text.
const bodySchema = z.object({
  videoUrl: httpUrl.nullable(),
  // Public attribution for videoUrl -- rendered as a header line above the embed and
  // hidden when empty (see components/ProgramVideoBlock.tsx). Plain text, not a URL.
  videoCredit: z.string().trim().max(120).nullable(),
  videoCreditUrl: httpUrl.nullable(),
});

/** Admin-only: sets or clears a program's overview video link and its attribution. See
 * lib/programs.ts's setProgramVideoFields. */
export async function PATCH(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const body = bodySchema.parse(await request.json());
    await setProgramVideoFields(id, {
      videoUrl: body.videoUrl,
      videoCredit: body.videoCredit || null,
      videoCreditUrl: body.videoCreditUrl,
    });
    await revalidateProgram(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update video fields" }, { status: 500 });
  }
}
