import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { voidPollResponse, restorePollResponse, approvePollResponse } from "@/lib/pollResponses";
import { prisma } from "@/lib/prisma";
import { revalidateProgram } from "@/lib/revalidate";

const bodySchema = z.object({ action: z.enum(["void", "restore", "approve"]) });

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

    // All three actions can move a response into or out of COUNTED, which changes the
    // response count/poll summary shown on the program page -- fetched up front so every
    // branch below can revalidate on success without a second round-trip.
    const existing = await prisma.pollResponse.findUnique({ where: { id }, select: { programId: true } });

    if (action === "void") {
      await voidPollResponse(id);
      if (existing) await revalidateProgram(existing.programId);
      return NextResponse.json({ ok: true });
    }

    if (action === "approve") {
      const result = await approvePollResponse(id);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: 409 });
      }
      if (existing) await revalidateProgram(existing.programId);
      return NextResponse.json({ ok: true });
    }

    const result = await restorePollResponse(id);
    if (!result.ok) {
      return NextResponse.json(
        { error: "Restoring this response would conflict with another counted response for the same user/email and program" },
        { status: 409 }
      );
    }
    if (existing) await revalidateProgram(existing.programId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update response" }, { status: 500 });
  }
}
