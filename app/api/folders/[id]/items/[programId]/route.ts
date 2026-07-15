import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { removeProgramFromFolder } from "@/lib/folders";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; programId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, programId } = await params;
  const result = await removeProgramFromFolder(userId, id, programId);
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
