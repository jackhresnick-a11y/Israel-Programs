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

const bodySchema = z.object({
  videoUrl: httpUrl.nullable(),
  // Raw transcript text -- admin-only, never validated as anything but a string. See
  // PROGRAM_PRIVATE_OMIT (lib/programs.ts) for why it can never reach a public route.
  videoTranscript: z.string().trim().max(50_000).nullable(),
  aiBrief: z.string().trim().max(2_000).nullable(),
});

/** Admin-only: sets or clears a program's overview video link, raw transcript, and
 * distilled public brief. See lib/programs.ts's setProgramVideoFields. */
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
      videoTranscript: body.videoTranscript || null,
      aiBrief: body.aiBrief || null,
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
