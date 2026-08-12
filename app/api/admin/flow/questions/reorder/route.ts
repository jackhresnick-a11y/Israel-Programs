import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { reorderFlowQuestions } from "@/lib/flow";

const postBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const { ids } = postBodySchema.parse(json);
    await reorderFlowQuestions(ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    // reorderFlowQuestions throws a plain Error when the new arrangement would
    // break an existing show-condition -- a user-actionable 400, not a server fault.
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to reorder questions" }, { status: 500 });
  }
}
