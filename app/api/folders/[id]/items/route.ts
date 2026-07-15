import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { addProgramToFolder } from "@/lib/folders";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const programId = typeof body.programId === "string" ? body.programId : "";

  const result = await addProgramToFolder(userId, id, programId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message ?? "Not found" }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
