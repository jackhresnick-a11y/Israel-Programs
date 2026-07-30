import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { saveAnswerSchema, flattenResolvedQuestionIds } from "@/lib/pollShared";
import { saveAnswer } from "@/lib/pollResponses";
import { getQuestionsForProgram } from "@/lib/pollConfig";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/** Same cookie this program's answer-save moves the browser-marker check to (see
 * lib/pollResponses.ts's maybeTransition) -- only ever set on a clean COUNTED
 * transition, read here to decide whether THIS browser already has one. */
function browserMarkerCookieName(programId: string): string {
  return `poll_v_${programId}`;
}
const BROWSER_MARKER_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Debounced per-question autosave. `id` is a bare responseId capability (no auth,
 * same posture as the pre-existing details route) -- every check here matters: rate
 * limited by IP, questionId re-derived and allowlisted against the program's live
 * resolved set (never trust the client), and lib/pollResponses.ts's saveAnswer itself
 * refuses to touch a VOIDED response. If this save is the one that crosses the
 * majority-of-Core bar, the response transitions to COUNTED/FLAGGED right here (see
 * saveAnswer -> maybeTransition) -- a clean anonymous COUNTED transition sets the
 * browser-marker cookie, same condition and shape as the old one-shot submit used to.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ip = getClientIp(request);
    if (!checkRateLimit(`poll-answer:${ip}`, { limit: 60, windowMs: 10 * 60_000 })) {
      return NextResponse.json({ error: "Too many requests -- try again in a few minutes" }, { status: 429 });
    }

    const json = await request.json();
    const body = saveAnswerSchema.parse(json);

    const response = await prisma.pollResponse.findUnique({
      where: { id },
      select: { programId: true, userId: true },
    });
    if (!response) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const resolved = await getQuestionsForProgram(response.programId);
    const allowedIds = new Set(flattenResolvedQuestionIds(resolved));
    if (!allowedIds.has(body.questionId)) {
      return NextResponse.json({ error: "This question isn't part of this program's rating form" }, { status: 400 });
    }

    const question = await prisma.pollQuestion.findUnique({
      where: { id: body.questionId },
      select: { version: true },
    });

    const cookieStore = await cookies();
    const markerCookieName = browserMarkerCookieName(response.programId);
    const hasBrowserMarker = cookieStore.has(markerCookieName);

    const result = await saveAnswer({
      responseId: id,
      questionId: body.questionId,
      questionVersion: question?.version ?? 1,
      value: body.na ? null : body.value,
      na: body.na,
      hasBrowserMarker,
    });

    // Same condition as the old one-shot submit: only a clean, COUNTED transition sets
    // the marker, so a respondent whose completion got FLAGGED isn't additionally
    // penalized with REPEAT_BROWSER on a legitimate retry later.
    if (!response.userId && result.status === "COUNTED") {
      cookieStore.set(markerCookieName, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: BROWSER_MARKER_MAX_AGE_SECONDS,
        path: "/",
      });
    }

    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save answer" }, { status: 500 });
  }
}
