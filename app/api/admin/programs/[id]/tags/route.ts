import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateProgramTags } from "@/lib/programs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  tags: z.array(z.string().trim().min(1)),
});

/** Admin-only: replaces one program's full tag set by name, for /admin/programs' inline
 * tag editor -- a focused sibling of PATCH /api/programs/[id] that doesn't require
 * resubmitting the rest of the program record just to add or remove a tag. */
export async function PATCH(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const { tags } = bodySchema.parse(await request.json());
    const updated = await updateProgramTags(id, tags);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update tags" }, { status: 500 });
  }
}
