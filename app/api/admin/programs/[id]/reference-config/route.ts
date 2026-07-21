import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { upsertReferenceConfig, referenceConfigPatchSchema } from "@/lib/referenceConfig";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { id } = await params;
    const json = await request.json();
    const body = referenceConfigPatchSchema.parse(json);
    const config = await upsertReferenceConfig(id, body);
    return NextResponse.json(config);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update reference visibility" }, { status: 500 });
  }
}
