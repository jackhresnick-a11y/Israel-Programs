import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { recordCounselorOutreach } from "@/lib/counselorContacts";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  status: z.enum(["NOT_CONTACTED", "CONTACTED", "REPLIED", "BOUNCED", "WRONG_CONTACT"]),
  note: z.string().trim().optional(),
});

/** Admin-only: records an outreach status change, appending an audit row --
 * mirrors POST /api/admin/programs/[id]/email-verification. */
export async function POST(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const { status, note } = bodySchema.parse(await request.json());
    await recordCounselorOutreach(id, status, check.userId, note);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to record outreach status" }, { status: 500 });
  }
}
