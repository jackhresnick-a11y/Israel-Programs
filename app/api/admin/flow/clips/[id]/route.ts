import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateFlowVideo } from "@/lib/flow";

const patchBodySchema = z
  .object({
    videoUrl: z.string().trim().url().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    transcript: z.string().trim().max(20000).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    speaker: z.string().trim().max(200).nullable().optional(),
    durationSeconds: z.number().int().positive().nullable().optional(),
    posterUrl: z.string().trim().url().nullable().optional(),
    status: z.enum(["ACTIVE", "RETIRED"]).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), "No changes provided");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { id } = await params;
    const json = await request.json();
    const body = patchBodySchema.parse(json);
    const video = await updateFlowVideo(id, body);
    return NextResponse.json(video);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update clip" }, { status: 500 });
  }
}
