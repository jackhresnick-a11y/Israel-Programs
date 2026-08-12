import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateFlowVideoTrigger, deleteFlowVideoTrigger, flowConditionSchema } from "@/lib/flow";

const patchBodySchema = z
  .object({
    mode: z.enum(["ON_DISPLAY", "ON_ANSWER"]).optional(),
    optionKeys: z.array(z.string()).optional(),
    when: flowConditionSchema.nullable().optional(),
    rolloutPercent: z.number().int().min(0).max(100).optional(),
    order: z.number().int().optional(),
    status: z.enum(["ACTIVE", "RETIRED"]).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), "No changes provided");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { id } = await params;
    const json = await request.json();
    const body = patchBodySchema.parse(json);
    const trigger = await updateFlowVideoTrigger(id, body);
    return NextResponse.json(trigger);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update trigger" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  try {
    await deleteFlowVideoTrigger(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete trigger" }, { status: 500 });
  }
}
