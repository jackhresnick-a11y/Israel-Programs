import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { bulkRejectPollReviews } from "@/lib/pollReviews";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  note: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { ids, note } = bodySchema.parse(await request.json());
    const result = await bulkRejectPollReviews(ids, check.userId, note);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to bulk-reject reviews" }, { status: 500 });
  }
}
