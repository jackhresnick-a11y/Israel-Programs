import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getFolder, renameFolder, deleteFolder } from "@/lib/folders";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await getFolder(userId, id);
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "";

  const result = await renameFolder(userId, id, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.message ?? "Not found" }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await deleteFolder(userId, id);
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
