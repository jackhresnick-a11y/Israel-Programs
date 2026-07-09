import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateRegion, deleteRegion } from "@/lib/regions";

const patchBodySchema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    order: z.number().int().optional(),
    memberSlugs: z.array(z.string()).optional(),
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
    const region = await updateRegion(id, body);
    return NextResponse.json(region);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update region" }, { status: 500 });
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
    await deleteRegion(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete region" }, { status: 500 });
  }
}
