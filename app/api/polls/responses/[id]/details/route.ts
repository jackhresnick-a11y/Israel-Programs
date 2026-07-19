import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { answerListSchema, reviewListSchema, naQuestionIdsSchema } from "@/lib/pollShared";
import { addDetailAnswersAndReviews } from "@/lib/pollResponses";
import { getQuestionsForProgram } from "@/lib/pollConfig";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const bodySchema = z.object({
  answers: answerListSchema,
  reviews: reviewListSchema.default([]),
  naQuestionIds: naQuestionIdsSchema,
});

/**
 * Adds "Add more detail" (non-core bucket) answers and reviews to a still-pending
 * anonymous response, after the initial submit -- the responseId in the URL is a bare
 * capability (no auth on this route), so every check here matters: rate-limited by IP,
 * question-id allowlist re-derived from the program's live config (never trust the
 * client's questionId set), and addDetailAnswersAndReviews itself refuses anything not
 * PENDING. `extras` (every non-core question the expander displayed) is passed through
 * so `presentedQuestionIds` reflects what was actually shown, not just what was
 * answered.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ip = getClientIp(request);
    if (!checkRateLimit(`poll-details:${ip}`, { limit: 20, windowMs: 10 * 60_000 })) {
      return NextResponse.json({ error: "Too many requests -- try again in a few minutes" }, { status: 429 });
    }

    const json = await request.json();
    const { answers, reviews, naQuestionIds } = bodySchema.parse(json);
    if (answers.some((a) => naQuestionIds.includes(a.questionId))) {
      return NextResponse.json({ error: "A question can't be both answered and marked N/A" }, { status: 400 });
    }

    const response = await prisma.pollResponse.findUnique({ where: { id }, select: { programId: true } });
    if (!response) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { extras } = await getQuestionsForProgram(response.programId);
    const extraQuestionIds = extras.flatMap((e) => e.questions.map((q) => q.id));
    const allowedIds = new Set(extraQuestionIds);
    const invalidAnswers = answers.filter((a) => !allowedIds.has(a.questionId));
    const invalidReviews = reviews.filter((r) => !allowedIds.has(r.questionId));
    const invalidNa = naQuestionIds.filter((qid) => !allowedIds.has(qid));
    if (invalidAnswers.length > 0 || invalidReviews.length > 0 || invalidNa.length > 0) {
      return NextResponse.json({ error: "One or more questions are not part of this program's rating form" }, { status: 400 });
    }

    const { skippedReviewQuestionIds } = await addDetailAnswersAndReviews(
      id,
      answers,
      reviews.map((r) => ({ questionId: r.questionId, text: r.text })),
      extraQuestionIds,
      naQuestionIds
    );
    return NextResponse.json({ ok: true, skippedReviewQuestionIds });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save additional answers" }, { status: 500 });
  }
}
