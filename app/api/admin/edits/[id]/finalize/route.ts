import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { applyReviewDecisions } from "@/lib/programEdits";

const bodySchema = z.object({
  decisions: z.array(
    z.object({
      fieldName: z.string().min(1),
      decision: z.enum(["ACCEPTED", "REJECTED"]),
      finalValue: z.string(),
    })
  ),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { decisions } = bodySchema.parse(body);
    await applyReviewDecisions(id, decisions);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to apply changes" }, { status: 500 });
  }
}
