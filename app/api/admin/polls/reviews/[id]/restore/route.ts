import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { restorePollReview } from "@/lib/pollReviews";
import { revalidateProgram } from "@/lib/revalidate";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { id } = await params;
    const result = await restorePollReview(id, check.userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    await revalidateProgram(result.programId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to restore review" }, { status: 500 });
  }
}
