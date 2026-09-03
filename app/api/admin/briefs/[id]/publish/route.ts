import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { publishBrief } from "@/lib/briefs";

type Params = { params: Promise<{ id: string }> };

/** Admin-only: the sole path a brief goes public. A separate, explicit action from
 * saving a draft -- nothing auto-publishes anywhere in this feature. */
export async function POST(_request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const brief = await publishBrief(id);
    return NextResponse.json(brief);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to publish brief" }, { status: 500 });
  }
}
