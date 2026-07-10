import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { recordEmailVerification } from "@/lib/emailVerification";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  status: z.enum(["VERIFIED", "BOUNCED", "WRONG_CONTACT"]),
  note: z.string().trim().max(1000).optional(),
});

/** Admin-only: records a human verification outcome for one program's contactEmail. */
export async function POST(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const { status, note } = bodySchema.parse(await request.json());
    await recordEmailVerification(id, status, check.userId, note);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error && err.message === "Program has no contactEmail to verify") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to record verification" }, { status: 500 });
  }
}
