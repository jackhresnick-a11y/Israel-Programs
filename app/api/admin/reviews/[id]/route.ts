import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { approveStandaloneReview, rejectStandaloneReview, hardDeleteStandaloneReview } from "@/lib/reviews";
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
        ? await approveStandaloneReview(id, check.userId)
        : await rejectStandaloneReview(id, check.userId, note);

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    // Approving/rejecting changes what ReviewsSection shows on the program page --
    // same reasoning as the PollReview PATCH route, which this one previously lacked.
    const review = await prisma.review.findUnique({ where: { id }, select: { programId: true } });
    if (review) await revalidateProgram(review.programId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update review" }, { status: 500 });
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
    const result = await hardDeleteStandaloneReview(id);
    if (!result) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    await revalidateProgram(result.programId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    const isKnownFkError =
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") ||
      (err instanceof Error && err.name === "DriverAdapterError" && (err as { cause?: { code?: string } }).cause?.code === "23001");
    if (isKnownFkError) {
      return NextResponse.json(
        { error: "Can't delete: this review has other records tied to it." },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete review" }, { status: 500 });
  }
}
