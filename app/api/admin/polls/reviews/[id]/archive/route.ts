import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { archivePollReview } from "@/lib/pollReviews";
import { revalidateProgram } from "@/lib/revalidate";

const bodySchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { id } = await params;
    const { note } = bodySchema.parse(await request.json().catch(() => ({})));

    const result = await archivePollReview(id, check.userId, note);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    await revalidateProgram(result.programId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to archive review" }, { status: 500 });
  }
}
