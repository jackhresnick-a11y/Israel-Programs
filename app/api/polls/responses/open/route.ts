import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@clerk/nextjs/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { hashIp } from "@/lib/pollIntegrity";
import { openPollSchema, flattenResolvedQuestionIds } from "@/lib/pollShared";
import { openSignedInResponse, openAnonymousResponse } from "@/lib/pollResponses";
import { getQuestionsForProgram } from "@/lib/pollConfig";
import { validateReferrerToken } from "@/lib/pollTokens";

/**
 * Poll-open: creates (or resumes) a PollResponse the moment the rating page loads,
 * before any answer exists -- the response starts INCOMPLETE and stays inert (excluded
 * from anti-abuse counts, results, and any displayed number) until enough Core-bucket
 * questions are answered to cross the majority "unlock" bar (see lib/pollUnlock.ts and
 * lib/pollResponses.ts's maybeTransition). Signed-in respondents are looked up by
 * (userId, programId) server-side; anonymous respondents send back whatever `resumeId`
 * they have in localStorage from a prior visit, honored only if it's a real, still-
 * INCOMPLETE response for this exact program.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  const ip = getClientIp(request);

  try {
    const json = await request.json();
    const body = openPollSchema.parse(json);

    const resolved = await getQuestionsForProgram(body.programId);
    const presentedQuestionIds = flattenResolvedQuestionIds(resolved);

    if (userId) {
      if (!checkRateLimit(`poll-open:${userId}`, { limit: 20, windowMs: 10 * 60_000 })) {
        return NextResponse.json({ error: "Too many requests -- try again in a few minutes" }, { status: 429 });
      }
      const response = await openSignedInResponse({
        programId: body.programId,
        userId,
        ipHash: hashIp(ip),
        presentedQuestionIds,
      });
      return NextResponse.json({
        ok: true,
        responseId: response.id,
        status: response.status,
        answers: Object.fromEntries(response.answers.map((a: { questionId: string; value: number }) => [a.questionId, a.value])),
        naQuestionIds: response.naQuestionIds,
      });
    }

    if (!checkRateLimit(`poll-open-anon:${ip}:${body.programId}`, { limit: 10, windowMs: 10 * 60_000 })) {
      return NextResponse.json({ error: "Too many requests -- try again in a few minutes" }, { status: 429 });
    }

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

    const response = await openAnonymousResponse({
      programId: body.programId,
      referrerTokenId: validation.token.id,
      ipHash: hashIp(ip),
      presentedQuestionIds,
      resumeId: body.resumeId,
    });
    return NextResponse.json({
      ok: true,
      responseId: response.id,
      status: response.status,
      answers: Object.fromEntries(response.answers.map((a: { questionId: string; value: number }) => [a.questionId, a.value])),
      naQuestionIds: response.naQuestionIds,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to open poll" }, { status: 500 });
  }
}
