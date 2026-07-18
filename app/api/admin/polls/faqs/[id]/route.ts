import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateFaq, updateFaqSchema, rejectFaq, deleteFaq } from "@/lib/programFaq";

const patchSchema = z.object({
  ...updateFaqSchema.shape,
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { id } = await params;
    const { note, ...patch } = patchSchema.parse(await request.json());

    // A reject carries a moderatorNote, same shape as lib/pollReviews.ts's rejectPollReview
    // -- routed separately from the general patch-shaped update so the note lands in the
    // right field.
    const result =
      patch.status === "REJECTED" ? await rejectFaq(id, check.userId, note) : await updateFaq(id, patch, check.userId);

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update FAQ entry" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  const result = await deleteFaq(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
