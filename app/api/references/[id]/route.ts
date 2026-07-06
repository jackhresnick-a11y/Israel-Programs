import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { deleteReference } from "@/lib/references";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  await deleteReference(id);
  return NextResponse.json({ ok: true });
}
