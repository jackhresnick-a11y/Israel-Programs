import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listFolders, createFolder } from "@/lib/folders";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folders = await listFolders(userId);
  return NextResponse.json(folders);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "";

  const result = await createFolder(userId, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.message ?? "Invalid request" }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
