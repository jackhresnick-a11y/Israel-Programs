import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { archiveBrief } from "@/lib/briefs";

type Params = { params: Promise<{ id: string }> };

/** Admin-only: retires a brief, freeing its (program, brief type) slot for a fresh
 * draft. If it was PUBLISHED, this pulls it from the public page/llms.txt/assistant
 * immediately (see lib/briefs.ts's archiveBrief). The row itself is retained, never
 * deleted. */
export async function POST(_request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const brief = await archiveBrief(id);
    return NextResponse.json(brief);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to archive brief" }, { status: 500 });
  }
}
