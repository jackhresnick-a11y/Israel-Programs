import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { rejectReference } from "@/lib/references";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  const reference = await rejectReference(id);
  return NextResponse.json(reference);
}
