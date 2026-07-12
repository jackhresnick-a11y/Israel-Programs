import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { markOutreachOutcome, markOutreachVerified } from "@/lib/outreach";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  outcome: z.enum(["REPLIED", "WRONG_CONTACT", "VERIFIED"]),
  note: z.string().trim().max(1000).optional(),
});

/** Admin-only: records the outcome of a sent outreach email. REPLIED only updates
 * OutreachEmail; WRONG_CONTACT and VERIFIED also write to the shared
 * contact-verification audit log (recordEmailVerification) since those two are
 * meaningful signals about the address itself, not just this one outreach attempt --
 * see lib/outreach.ts for the reasoning. */
export async function POST(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const { outcome, note } = bodySchema.parse(await request.json());

    if (outcome === "VERIFIED") {
      const row = await markOutreachVerified(id, check.userId, note);
      return NextResponse.json(row);
    }
    const row = await markOutreachOutcome(id, outcome, check.userId, note);
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Outreach record not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to record outcome" }, { status: 500 });
  }
}
