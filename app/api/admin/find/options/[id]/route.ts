import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateFinderOption, deleteFinderOption } from "@/lib/finder";

const patchBodySchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    helpText: z.string().trim().max(300).nullable().optional(),
    order: z.number().int().optional(),
    status: z.enum(["ACTIVE", "RETIRED"]).optional(),
    tagSlugs: z.array(z.string()).optional(),
    durationValues: z.array(z.string()).optional(),
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
    const option = await updateFinderOption(id, body);
    return NextResponse.json(option);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update option" }, { status: 500 });
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
    await deleteFinderOption(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete option" }, { status: 500 });
  }
}
