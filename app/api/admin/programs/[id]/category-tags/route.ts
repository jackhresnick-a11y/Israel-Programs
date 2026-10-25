import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { setCategoryTags, InvalidCategoryTagsError } from "@/lib/tags";
import { revalidateProgram } from "@/lib/revalidate";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  category: z.enum(["program-type", "essence", "gender", "affiliation", "israeli-integration"]),
  slugs: z.array(z.string().trim().min(1)),
});

/** Admin-only: replaces a program's tag set within one category (program-type,
 * essence, gender, affiliation, or israeli-integration), leaving every other category's
 * tags untouched -- see setCategoryTags' doc comment for why this can't reuse
 * PATCH /api/admin/programs/[id]/tags (which does a full-array replace). Used by the
 * /admin/tags/coverage inline editor. The category allowlist is deliberately an enum,
 * not an open string -- it excludes location (Region-managed) and language (dormant). */
export async function PATCH(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const { category, slugs } = bodySchema.parse(await request.json());
    const updated = await setCategoryTags(id, category, slugs);
    await revalidateProgram(id);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof InvalidCategoryTagsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update tags" }, { status: 500 });
  }
}
