import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getMembership } from "@/lib/folders";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const programId = searchParams.get("programId");
  if (!programId) {
    return NextResponse.json({ error: "programId is required" }, { status: 400 });
  }

  const folderIds = await getMembership(userId, programId);
  return NextResponse.json({ folderIds });
}
