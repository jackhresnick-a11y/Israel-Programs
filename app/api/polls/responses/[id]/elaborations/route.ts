import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { elaborationAnswerSubmitSchema } from "@/lib/pollShared";
import { createElaborationAnswer, listAnsweredPromptKeys } from "@/lib/pollElaborations";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Submits one answer to the end-of-poll elaboration block. `id` is a bare responseId
 * capability (no auth), same posture as the answer/details routes -- rate-limited by IP,
 * and createElaborationAnswer itself re-validates the prompt against the live config and
 * refuses a VOIDED response. Deliberately does NOT touch PollResponse in any way (no
 * status, no flags, no presentedQuestionIds) -- answering or skipping this block can never
 * affect readiness/counting, same invariant lib/pollReferences.test.ts already asserts for
 * per-question reviews.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ip = getClientIp(request);
    if (!checkRateLimit(`poll-elaborations:${ip}`, { limit: 30, windowMs: 10 * 60_000 })) {
      return NextResponse.json({ error: "Too many requests — try again in a few minutes" }, { status: 429 });
    }

    const { promptKey, text } = elaborationAnswerSubmitSchema.parse(await request.json());
    const result = await createElaborationAnswer({ responseId: id, promptKey, text });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ ok: true, skipped: result.skipped });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save your answer" }, { status: 500 });
  }
}

/** The prompt keys this response has already answered -- feeds ElaborationBlock's
 * chooser so a reload never re-offers an already-answered prompt. Same bare-responseId
 * capability posture as the POST above. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const answeredPromptKeys = await listAnsweredPromptKeys(id);
    return NextResponse.json({ ok: true, answeredPromptKeys });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load answered prompts" }, { status: 500 });
  }
}
