import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { approveProgram } from "@/lib/programs";
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
  const program = await approveProgram(id);
  // Approval flips the status gate on /programs/[id]'s slug from notFound() to visible --
  // without this, a slug that 404'd pre-approval (never in generateStaticParams) could
  // keep serving a cached 404 for up to the 1-hour window instead of the newly-live page.
  await revalidateProgram(id);
  return NextResponse.json(program);
}
