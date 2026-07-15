import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { clearUnavailableItems } from "@/lib/folders";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await clearUnavailableItems(userId, id);
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
