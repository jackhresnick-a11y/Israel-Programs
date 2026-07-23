import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { approvePendingTag } from "@/lib/pendingTags";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  await approvePendingTag(id, check.userId);
  return NextResponse.json({ ok: true });
}
