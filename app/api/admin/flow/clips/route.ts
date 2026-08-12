import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { createFlowVideo } from "@/lib/flow";

const postBodySchema = z.object({
  videoUrl: z.string().trim().url(),
  title: z.string().trim().min(1).max(200),
  transcript: z.string().trim().max(20000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  speaker: z.string().trim().max(200).nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = postBodySchema.parse(json);
    const video = await createFlowVideo(body);
    return NextResponse.json(video);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    // createFlowVideo throws a plain Error for an unrecognized/unsupported link.
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create clip" }, { status: 500 });
  }
}
