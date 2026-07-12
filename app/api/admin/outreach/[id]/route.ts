import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateDraft } from "@/lib/outreach";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  subject: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).optional(),
});

/** Admin-only: hand-edits a draft's subject/body. Marks it edited: true so a later
 * generate-drafts run never overwrites this row (see lib/outreach.ts). */
export async function PATCH(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const input = bodySchema.parse(await request.json());
    const updated = await updateDraft(id, input);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
  }
}
