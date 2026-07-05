import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { rejectEdit } from "@/lib/programs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  const edit = await rejectEdit(id);
  return NextResponse.json(edit);
}
