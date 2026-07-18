import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { reorderFaqs } from "@/lib/programFaq";

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1) });

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { ids } = bodySchema.parse(await request.json());
    await reorderFaqs(ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to reorder FAQ entries" }, { status: 500 });
  }
}
