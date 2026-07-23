import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { rejectPendingTag } from "@/lib/pendingTags";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  const pendingTag = await rejectPendingTag(id, check.userId);
  return NextResponse.json(pendingTag);
}
