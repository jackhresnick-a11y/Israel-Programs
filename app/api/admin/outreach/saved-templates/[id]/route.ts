import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateOutreachTemplate, deleteOutreachTemplate } from "@/lib/outreachTemplates";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  subject: z.string().trim().min(1, "Subject is required").optional(),
  body: z.string().trim().min(1, "Body is required").optional(),
});

/** Admin-only: updates a saved template's name/subject/body. */
export async function PATCH(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const input = bodySchema.parse(await request.json());
    const updated = await updateOutreachTemplate(id, input);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err) {
      if (err.code === "P2002") {
        return NextResponse.json({ error: "A template with that name already exists" }, { status: 409 });
      }
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

/** Admin-only: deletes a saved template. Never touches OutreachEmail rows already
 * generated from it -- drafts/sent emails are independent copies, not linked back. */
export async function DELETE(_request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    await deleteOutreachTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
