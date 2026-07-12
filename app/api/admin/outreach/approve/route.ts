import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { approveDrafts } from "@/lib/outreach";

const bodySchema = z.object({
  ids: z.array(z.string()).min(1),
});

/** Admin-only: approves one or more DRAFT rows (individual approve is just a
 * one-element array). Only DRAFT rows are affected -- see lib/outreach.ts's
 * approveDrafts, which filters status: "DRAFT" so this can't be used to "re-approve"
 * a row past SENT/BOUNCED/etc. */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { ids } = bodySchema.parse(await request.json());
    const result = await approveDrafts(ids, check.userId);
    return NextResponse.json({ approved: result.count });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to approve drafts" }, { status: 500 });
  }
}
