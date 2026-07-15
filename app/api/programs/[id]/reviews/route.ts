import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().trim().min(1, "Review text is required").max(3000),
});

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to leave a review" }, { status: 401 });
  }

  if (!checkRateLimit(`review:${userId}`, { limit: 5, windowMs: 10 * 60_000 })) {
    return NextResponse.json({ error: "Too many reviews — please try again later." }, { status: 429 });
  }

  const { id } = await params;
  const user = await currentUser();
  const reviewerName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    "Anonymous";

  try {
    const body = await request.json();
    const { rating, text } = reviewSchema.parse(body);

    const review = await prisma.review.create({
      data: { programId: id, rating, text, reviewerName, userId },
    });
    return NextResponse.json(review, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
  }
}
