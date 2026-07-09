import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateDurationOption } from "@/lib/duration";
import { DurationType } from "@/app/generated/prisma/enums";

const patchBodySchema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    order: z.number().int().optional(),
    showInFilter: z.boolean().optional(),
  })
  .refine(
    (b) => Object.values(b).some((v) => v !== undefined),
    "No changes provided"
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ value: string }> }
) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { value } = await params;
    if (!Object.values(DurationType).includes(value as DurationType)) {
      return NextResponse.json({ error: "Unknown duration value" }, { status: 400 });
    }
    const json = await request.json();
    const body = patchBodySchema.parse(json);
    const option = await updateDurationOption(value as DurationType, body);
    return NextResponse.json(option);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update duration option" }, { status: 500 });
  }
}
