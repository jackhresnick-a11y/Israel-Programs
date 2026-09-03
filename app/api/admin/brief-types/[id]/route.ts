import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { briefTypeUpdateSchema, deleteBriefType, updateBriefType } from "@/lib/briefs";

type Params = { params: Promise<{ id: string }> };

/** Admin-only: edits a brief type's name/slug/prompt/flags/order/active state.
 * promptVersion bumps automatically (see lib/briefs.ts's updateBriefType) only when
 * promptText actually changes -- never on any other field. */
export async function PATCH(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const body = briefTypeUpdateSchema.parse(await request.json());
    const briefType = await updateBriefType(id, body);
    return NextResponse.json(briefType);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && (err.code === "P2025" || err.code === "P2002")) {
      const message = err.code === "P2002" ? "A brief type with that slug already exists" : "Brief type not found";
      return NextResponse.json({ error: message }, { status: err.code === "P2002" ? 400 : 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update brief type" }, { status: 500 });
  }
}

/** Admin-only: deletes a brief type outright -- refused (400) if any ProgramBrief still
 * references it, since the DB relation is onDelete: Restrict. Deactivate a type that has
 * briefs instead (PATCH { active: false }). */
export async function DELETE(_request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    await deleteBriefType(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Brief type not found" }, { status: 404 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete brief type" }, { status: 500 });
  }
}
