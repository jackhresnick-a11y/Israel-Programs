import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { archiveProgram } from "@/lib/programs";
import { revalidateProgram } from "@/lib/revalidate";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  const program = await archiveProgram(id);
  // A previously-PUBLISHED program that gets archived must stop serving its cached page
  // (now should 404) promptly rather than staying visible for up to the 1-hour window.
  await revalidateProgram(id);
  return NextResponse.json(program);
}
