import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateFlowQuestion, deleteFlowQuestion, flowConditionSchema, flowOptionSetRulesSchema } from "@/lib/flow";

const patchBodySchema = z
  .object({
    prompt: z.string().trim().min(1).max(300).optional(),
    helpText: z.string().trim().max(500).nullable().optional(),
    type: z.enum(["FILTER", "CHALLENGE", "TRADEOFF"]).optional(),
    skippable: z.boolean().optional(),
    showWhen: flowConditionSchema.nullable().optional(),
    optionSetRules: flowOptionSetRulesSchema.nullable().optional(),
    defaultOptionSetKey: z.string().trim().max(64).nullable().optional(),
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
    const question = await updateFlowQuestion(id, body);
    return NextResponse.json(question);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    // updateFlowQuestion throws a plain Error for a bad forward-reference in
    // showWhen/optionSetRules -- a user input mistake, not a server fault.
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update question" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  try {
    await deleteFlowQuestion(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // deleteFlowQuestion throws a plain Error when the question already has
    // responses ("retire it instead") -- a user-actionable 400, not a server fault.
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete question" }, { status: 500 });
  }
}
