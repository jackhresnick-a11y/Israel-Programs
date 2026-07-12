import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { deleteDrafts } from "@/lib/outreach";

const bodySchema = z.object({
  ids: z.array(z.string()).min(1),
});

/** Admin-only: bulk-deletes OutreachEmail rows (DRAFT/APPROVED only -- see
 * lib/outreach.ts's deleteDrafts). SENT/BOUNCED/REPLIED/WRONG_CONTACT rows in the
 * selection are silently skipped rather than erroring, so a mixed selection still
 * deletes what it can -- deleted may be less than ids.length, which the caller
 * surfaces to the admin. Never touches the underlying Program. */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { ids } = bodySchema.parse(await request.json());
    const result = await deleteDrafts(ids);
    return NextResponse.json({ deleted: result.count, requested: ids.length });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete drafts" }, { status: 500 });
  }
}
