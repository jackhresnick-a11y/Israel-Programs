import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { setProgramOutreachCategory } from "@/lib/programs";
import { CATEGORY_KEYS } from "@/lib/outreachCategories";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  category: z.enum(CATEGORY_KEYS).nullable(),
});

/** Admin-only: sets or clears one program's manual outreach-category override (see
 * lib/outreachCategories.ts's categorizeProgram). null reverts to automatic rules. */
export async function POST(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const { category } = bodySchema.parse(await request.json());
    await setProgramOutreachCategory(id, category);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update outreach category" }, { status: 500 });
  }
}
