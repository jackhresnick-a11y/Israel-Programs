import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { voidPollResponse, restorePollResponse } from "@/lib/pollResponses";

const bodySchema = z.object({ action: z.enum(["void", "restore"]) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { id } = await params;
    const json = await request.json();
    const { action } = bodySchema.parse(json);

    if (action === "void") {
      await voidPollResponse(id);
      return NextResponse.json({ ok: true });
    }

    const result = await restorePollResponse(id);
    if (!result.ok) {
      return NextResponse.json(
        { error: "Restoring this response would conflict with another counted response for the same user/email and program" },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update response" }, { status: 500 });
  }
}
