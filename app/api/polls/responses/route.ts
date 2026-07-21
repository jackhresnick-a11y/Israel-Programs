import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { auth } from "@clerk/nextjs/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { hashIp } from "@/lib/pollIntegrity";
import { signedInSubmitSchema, anonymousSubmitSchema, flattenResolvedQuestionIds } from "@/lib/pollShared";
import { submitSignedInResponse, submitAnonymousResponse } from "@/lib/pollResponses";
import { getQuestionsForProgram } from "@/lib/pollConfig";
import { validateReferrerToken } from "@/lib/pollTokens";

/** One-per-program browser marker, set only on a COUNTED anonymous submit and read on
 * the next one -- the REPEAT_BROWSER anti-abuse signal (see
 * lib/pollResponses.ts's submitAnonymousResponse). httpOnly so client JS can't read or
 * forge it; ~1 year TTL is long enough that "already rated this" stays true across a
 * normal browsing session without needing indefinite persistence. */
function browserMarkerCookieName(programId: string): string {
  return `poll_v_${programId}`;
}
const BROWSER_MARKER_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

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
      // marks for questions that are actually part of this program's live RESOLVED
      // question set. The signed-in form renders Core plus every extra bucket inline
      // (components/polls/RateForm.tsx's SignedInRateForm), so the allowlist must be
      // the full resolved set, not Core alone -- Core-only here previously rejected
      // legitimate answers to the extra questions the form itself just displayed.
      const resolved = await getQuestionsForProgram(body.programId);
      const allQuestionIds = flattenResolvedQuestionIds(resolved);
      const allowedIds = new Set(allQuestionIds);
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
        presentedQuestionIds: allQuestionIds,
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
      return NextResponse.json({ ok: true, responseId: "ok", status: "COUNTED" });
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

    const resolved = await getQuestionsForProgram(body.programId);
    // The allowlist here is deliberately the FULL resolved set (core + extras), not
    // just what's presented at this initial step -- accept any answer whose questionId
    // is genuinely part of this program's poll, reject only a bogus id (see
    // flattenResolvedQuestionIds's doc comment). In practice the initial anonymous
    // submit only ever sends core (extras live behind the post-submit "add more
    // detail" expander), so this only matters for the presentedQuestionIds distinction
    // below, not for what answers get accepted.
    const allowedIds = new Set(flattenResolvedQuestionIds(resolved));
    const invalidAnswers = body.answers.filter((a) => !allowedIds.has(a.questionId));
    const invalidReviews = body.reviews.filter((r) => !allowedIds.has(r.questionId));
    const invalidNa = body.naQuestionIds.filter((id) => !allowedIds.has(id));
    if (invalidAnswers.length > 0 || invalidReviews.length > 0 || invalidNa.length > 0) {
      return NextResponse.json({ error: "One or more questions are not part of this program's rating form" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const markerCookieName = browserMarkerCookieName(body.programId);
    const hasBrowserMarker = cookieStore.has(markerCookieName);

    const { response, skippedReviewQuestionIds } = await submitAnonymousResponse({
      programId: body.programId,
      referrerTokenId: validation.token.id,
      tokenFlags: validation.flags,
      answers: body.answers,
      naQuestionIds: body.naQuestionIds,
      reviews: body.reviews.map((r) => ({ questionId: r.questionId, text: r.text })),
      // The anonymous form now presents the full resolved set (core + extras) inline,
      // same as the signed-in form, so stamp the same full list here -- matching the
      // signed-in branch's `allQuestionIds` above -- so moderation's skip/N-A diff
      // reflects what was actually shown.
      presentedQuestionIds: flattenResolvedQuestionIds(resolved),
      yearAttended: body.yearAttended ?? null,
      completion: body.completion ?? null,
      ipHash: hashIp(ip),
      email: body.email ?? null,
      hasBrowserMarker,
    });

    // Only a clean, COUNTED submit sets the marker -- a FLAGGED one doesn't, so a
    // respondent whose first attempt got flagged (e.g. a shared office IP) isn't
    // additionally penalized with REPEAT_BROWSER on a legitimate retry later.
    if (response.status === "COUNTED") {
      cookieStore.set(markerCookieName, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: BROWSER_MARKER_MAX_AGE_SECONDS,
        path: "/",
      });
    }

    return NextResponse.json({
      ok: true,
      responseId: response.id,
      verified: false,
      status: response.status,
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
