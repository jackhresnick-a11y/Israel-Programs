import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { markSubmitted, finalizeReferenceFromPoll } from "@/lib/pollResponses";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { trackPollSubmitted } from "@/lib/pollAnalytics";

/**
 * The explicit "Submit ratings" action. `id` is a bare responseId capability with no auth,
 * same posture as the sibling /answer and /details autosave routes.
 *
 * This route saves NO answer data. Every answer, review, and contact field is already
 * persisted by autosave before this is called (the client flushes any pending debounced
 * save first), so submitting is exactly two things: stamp `submittedAt`, and turn the
 * already-staged contact email into a PENDING Reference. It deliberately does NOT touch
 * `status`, `flags`, `verified`, or any PollAnswer row -- whether a response counts toward
 * a program's unlock is decided solely by the readiness bar during autosave, and pressing
 * submit cannot change it in either direction.
 *
 * Idempotent by construction: markSubmitted's where-clause keeps the first timestamp, and
 * upsertReferenceFromPoll is guarded by a DB unique. Re-submitting (which the signed-in
 * "update your rating" path does legitimately) creates no duplicate response row and no
 * duplicate pending reference.
 *
 * Deliberately does NOT set the poll_v_<programId> browser-marker cookie -- that belongs to
 * the COUNTED transition and is already handled in the /answer and /details routes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ip = getClientIp(request);
    if (!checkRateLimit(`poll-submit:${ip}`, { limit: 10, windowMs: 10 * 60_000 })) {
      return NextResponse.json({ error: "Too many requests — try again in a few minutes" }, { status: 429 });
    }

    const response = await prisma.pollResponse.findUnique({
      where: { id },
      select: { programId: true },
    });
    if (!response) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await markSubmitted(id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // After the stamp, never before: the reference is derived from data autosave already
    // wrote, and a failure inside here is swallowed so it can't fail the submission.
    await finalizeReferenceFromPoll(id);

    trackPollSubmitted(response.programId, id, result.status);

    return NextResponse.json({ ok: true, status: result.status, submittedAt: result.submittedAt.toISOString() });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }
}
