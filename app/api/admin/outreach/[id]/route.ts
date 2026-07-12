import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { deleteDrafts, updateDraft } from "@/lib/outreach";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  subject: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).optional(),
  toEmail: z.string().trim().email("Not a valid email address").optional(),
});

/** Admin-only: hand-edits a draft's subject/body/toEmail. Marks it edited: true so a
 * later generate-drafts run never overwrites this row; setting toEmail also marks
 * toEmailOverridden: true (see lib/outreach.ts's updateDraft). DRAFT-only -- rejects
 * with 409 if the row has already moved past DRAFT. */
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
    if (err instanceof Error && err.message === "Only DRAFT rows can be edited") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
  }
}

/** Admin-only: deletes a single OutreachEmail row (DRAFT/APPROVED only -- see
 * lib/outreach.ts's deleteDrafts). Never touches the underlying Program. */
export async function DELETE(_request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const result = await deleteDrafts([id]);
    if (result.count === 0) {
      return NextResponse.json(
        { error: "Not found, or not deletable (only DRAFT/APPROVED rows can be deleted)" },
        { status: 409 }
      );
    }
    return NextResponse.json({ deleted: result.count });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}
