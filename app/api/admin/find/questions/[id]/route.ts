import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateFinderQuestion, deleteFinderQuestion } from "@/lib/finder";

const patchBodySchema = z
  .object({
    prompt: z.string().trim().min(1).max(200).optional(),
    helpText: z.string().trim().max(300).nullable().optional(),
    order: z.number().int().optional(),
    status: z.enum(["ACTIVE", "RETIRED"]).optional(),
  })
  .refine(
    (b) => Object.values(b).some((v) => v !== undefined),
    "No changes provided"
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { id } = await params;
    const json = await request.json();
    const body = patchBodySchema.parse(json);
    const question = await updateFinderQuestion(id, body);
    return NextResponse.json(question);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update question" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  try {
    await deleteFinderQuestion(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete question" }, { status: 500 });
  }
}
