import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateFlowOption, deleteFlowOption, UnknownTagSlugsError, flowConditionSchema } from "@/lib/flow";

const patchBodySchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    rationale: z.string().trim().max(400).nullable().optional(),
    order: z.number().int().optional(),
    status: z.enum(["ACTIVE", "RETIRED"]).optional(),
    tagSlugs: z.array(z.string()).optional(),
    durationValues: z.array(z.string()).optional(),
    matchMode: z.enum(["WEIGHT", "REQUIRE"]).optional(),
    weight: z.number().int().optional(),
    requireIncludesUntagged: z.boolean().optional(),
    optionSetKeys: z.array(z.string()).optional(),
    showWhen: flowConditionSchema.nullable().optional(),
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
    const option = await updateFlowOption(id, body);
    return NextResponse.json(option);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof UnknownTagSlugsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // updateFlowOption throws a plain Error when retiring would leave another
    // question's show-condition referencing a now-unreachable option -- a
    // user-actionable 400, not a server fault.
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update option" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  try {
    await deleteFlowOption(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // deleteFlowOption throws a plain Error when the option already has responses
    // ("retire it instead") -- a user-actionable 400, not a server fault.
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete option" }, { status: 500 });
  }
}
