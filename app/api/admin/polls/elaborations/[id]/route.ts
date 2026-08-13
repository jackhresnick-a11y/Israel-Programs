import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { approveElaborationAnswer, rejectElaborationAnswer, hardDeleteElaborationAnswer } from "@/lib/pollElaborations";
import { prisma } from "@/lib/prisma";
import { revalidateProgram } from "@/lib/revalidate";
import { Prisma } from "@/app/generated/prisma/client";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000).optional(),
});

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
    const { action, note } = bodySchema.parse(await request.json());

    const result =
      action === "approve"
        ? await approveElaborationAnswer(id, check.userId)
        : await rejectElaborationAnswer(id, check.userId, note);

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    // Approving/rejecting changes what ReviewsSection shows on the program page.
    const answer = await prisma.pollElaborationAnswer.findUnique({
      where: { id },
      select: { response: { select: { programId: true } } },
    });
    if (answer) await revalidateProgram(answer.response.programId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update answer" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  try {
    const result = await hardDeleteElaborationAnswer(id);
    if (!result) {
      return NextResponse.json({ error: "Answer not found" }, { status: 404 });
    }
    await revalidateProgram(result.programId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Answer not found" }, { status: 404 });
    }
    const isKnownFkError =
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") ||
      (err instanceof Error && err.name === "DriverAdapterError" && (err as { cause?: { code?: string } }).cause?.code === "23001");
    if (isKnownFkError) {
      return NextResponse.json(
        { error: "Can't delete: this answer has other records tied to it." },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete answer" }, { status: 500 });
  }
}
