import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@clerk/nextjs/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { hashIp } from "@/lib/pollIntegrity";
import { signedInSubmitSchema, anonymousSubmitSchema } from "@/lib/pollShared";
import { submitSignedInResponse, submitAnonymousResponse } from "@/lib/pollResponses";
import { getQuestionsForProgram } from "@/lib/pollConfig";
import { validateReferrerToken } from "@/lib/pollTokens";

export async function POST(request: Request) {
  const { userId } = await auth();
  const ip = getClientIp(request);

  try {
    const json = await request.json();

    if (userId) {
      if (!checkRateLimit(`poll:${userId}`, { limit: 20, windowMs: 10 * 60_000 })) {
        return NextResponse.json({ error: "Too many requests -- try again in a few minutes" }, { status: 429 });
      }

      const body = signedInSubmitSchema.parse(json);

      // Never trust the client's questionId set -- only accept answers/reviews/N/A
      // marks for questions that are actually part of this program's live (Core)
      // question set.
      const { core } = await getQuestionsForProgram(body.programId);
      const allowedIds = new Set(core.map((q) => q.id));
      const invalidAnswers = body.answers.filter((a) => !allowedIds.has(a.questionId));
      const invalidReviews = body.reviews.filter((r) => !allowedIds.has(r.questionId));
      const invalidNa = body.naQuestionIds.filter((id) => !allowedIds.has(id));
      if (invalidAnswers.length > 0 || invalidReviews.length > 0 || invalidNa.length > 0) {
        return NextResponse.json({ error: "One or more questions are not part of this program's rating form" }, { status: 400 });
      }

      const { response, skippedReviewQuestionIds } = await submitSignedInResponse({
        programId: body.programId,
        userId,
        answers: body.answers,
        naQuestionIds: body.naQuestionIds,
        reviews: body.reviews.map((r) => ({ questionId: r.questionId, text: r.text })),
        presentedQuestionIds: core.map((q) => q.id),
        ipHash: hashIp(ip),
      });
      return NextResponse.json({
        ok: true,
        responseId: response.id,
        verified: true,
        status: "COUNTED",
        skippedReviewQuestionIds,
      });
    }

    // Anonymous link-path submission.
    const body = anonymousSubmitSchema.parse(json);

    // Honeypot: real users never fill this field in. Report success without writing
    // anything, so a bot can't distinguish a honeypot trip from a real submission --
    // same posture as app/api/contact/route.ts.
    if (body.website) {
      return NextResponse.json({ ok: true, responseId: "ok", status: "PENDING" });
    }

    if (!checkRateLimit(`poll-anon:${ip}:${body.programId}`, { limit: 10, windowMs: 10 * 60_000 })) {
      return NextResponse.json({ error: "Too many requests -- try again in a few minutes" }, { status: 429 });
    }

    // The anonymous form is only ever reachable from /rate/[slug] with a token that
    // resolves (even a revoked/expired/over-cap one -- those are accepted and flagged,
    // never rejected). A missing `ref`, or one that doesn't resolve to any token at
    // all, means this request didn't come through that page -- reject it rather than
    // creating an unattributed anonymous response.
    if (!body.ref) {
      return NextResponse.json({ error: "A rating link is required" }, { status: 400 });
    }
    const validation = await validateReferrerToken(body.ref);
    if (!validation.ok) {
      return NextResponse.json({ error: "This rating link is no longer valid" }, { status: 400 });
    }
    if (validation.token.programId !== body.programId) {
      return NextResponse.json({ error: "This rating link doesn't match this program" }, { status: 400 });
    }

    const { core } = await getQuestionsForProgram(body.programId);
    const allowedIds = new Set(core.map((q) => q.id));
    const invalidAnswers = body.answers.filter((a) => !allowedIds.has(a.questionId));
    const invalidReviews = body.reviews.filter((r) => !allowedIds.has(r.questionId));
    const invalidNa = body.naQuestionIds.filter((id) => !allowedIds.has(id));
    if (invalidAnswers.length > 0 || invalidReviews.length > 0 || invalidNa.length > 0) {
      return NextResponse.json({ error: "One or more questions are not part of this program's rating form" }, { status: 400 });
    }

    const { response, skippedReviewQuestionIds } = await submitAnonymousResponse({
      programId: body.programId,
      referrerTokenId: validation.token.id,
      tokenFlags: validation.flags,
      answers: body.answers,
      naQuestionIds: body.naQuestionIds,
      reviews: body.reviews.map((r) => ({ questionId: r.questionId, text: r.text })),
      presentedQuestionIds: core.map((q) => q.id),
      yearAttended: body.yearAttended ?? null,
      completion: body.completion ?? null,
      ipHash: hashIp(ip),
    });

    return NextResponse.json({
      ok: true,
      responseId: response.id,
      verified: false,
      status: "PENDING",
      skippedReviewQuestionIds,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to submit rating" }, { status: 500 });
  }
}
