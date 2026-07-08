import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { mergeTags } from "@/lib/tags";

const postBodySchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const { sourceId, targetId } = postBodySchema.parse(json);
    if (sourceId === targetId) {
      return NextResponse.json({ error: "Choose two different tags" }, { status: 400 });
    }
    await mergeTags(sourceId, targetId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to merge tags" }, { status: 500 });
  }
}
