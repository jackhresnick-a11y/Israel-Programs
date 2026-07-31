import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { detailsSubmitSchema, flattenResolvedQuestionIds } from "@/lib/pollShared";
import { addDetailAnswersAndReviews } from "@/lib/pollResponses";
import { getQuestionsForProgram } from "@/lib/pollConfig";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

function browserMarkerCookieName(programId: string): string {
  return `poll_v_${programId}`;
}

/**
 * Autosaves everything that isn't a star rating: reviews, N/A marks, and the
 * response-level contact fields (the anonymous path's 18+-gated reference email, the
 * signed-in contact opt-in) -- star ratings themselves go through the `/answer` route.
 * Originally built only for "add more detail" after an initial submit; now the allowlist
 * is the program's FULL resolved question set (core + extras), not extras-only, since
 * there's no more "initial submit already covered core" moment once everything
 * autosaves continuously from poll-open. `id` is a bare responseId capability (no
 * auth), same posture as the answer route: rate-limited by IP, question-id allowlist
 * re-derived from the program's live config, and addDetailAnswersAndReviews itself
 * refuses anything not already INCOMPLETE/COUNTED/FLAGGED (never VOIDED). An N/A mark
 * can cross the readiness bar just like an answer would, so this reads/sets the
 * browser-marker cookie the same way the answer route does.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ip = getClientIp(request);
    if (!checkRateLimit(`poll-details:${ip}`, { limit: 30, windowMs: 10 * 60_000 })) {
      return NextResponse.json({ error: "Too many requests — try again in a few minutes" }, { status: 429 });
    }

    const json = await request.json();
    const { answers, reviews, naQuestionIds, referenceEmail, ageAttested, contactOptIn, yearAttended } = detailsSubmitSchema.parse(json);

    const response = await prisma.pollResponse.findUnique({ where: { id }, select: { programId: true, userId: true } });
    if (!response) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const resolved = await getQuestionsForProgram(response.programId);
    const allowedIds = new Set(flattenResolvedQuestionIds(resolved));
    const invalidAnswers = answers.filter((a) => !allowedIds.has(a.questionId));
    const invalidReviews = reviews.filter((r) => !allowedIds.has(r.questionId));
    const invalidNa = naQuestionIds.filter((qid) => !allowedIds.has(qid));
    if (invalidAnswers.length > 0 || invalidReviews.length > 0 || invalidNa.length > 0) {
      return NextResponse.json({ error: "One or more questions are not part of this program’s rating form" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const markerCookieName = browserMarkerCookieName(response.programId);
    const hasBrowserMarker = cookieStore.has(markerCookieName);

    const { skippedReviewQuestionIds } = await addDetailAnswersAndReviews(
      id,
      answers,
      reviews.map((r) => ({ questionId: r.questionId, text: r.text })),
      // presentedQuestionIds is stamped from whatever this call's answers/reviews touch
      // plus the full resolved set once, at open -- no separate "extras" concept left to
      // pass here now that core and extras autosave identically.
      [],
      naQuestionIds,
      { referenceEmail, ageAttested, contactOptIn: contactOptIn ?? undefined, yearAttended },
      hasBrowserMarker
    );

    const fresh = await prisma.pollResponse.findUnique({ where: { id }, select: { status: true } });

    if (!response.userId && fresh?.status === "COUNTED") {
      cookieStore.set(markerCookieName, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 365 * 24 * 60 * 60,
        path: "/",
      });
    }

    return NextResponse.json({ ok: true, status: fresh?.status, skippedReviewQuestionIds });
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
