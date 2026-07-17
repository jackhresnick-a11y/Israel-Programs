import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@clerk/nextjs/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { hashIp } from "@/lib/pollIntegrity";
import { signedInSubmitSchema } from "@/lib/pollShared";
import { submitSignedInResponse } from "@/lib/pollResponses";
import { getQuestionsForProgram } from "@/lib/pollConfig";

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

      // Never trust the client's questionId set -- only accept answers to questions
      // that are actually part of this program's live (Core) question set.
      const { core } = await getQuestionsForProgram(body.programId);
      const allowedIds = new Set(core.map((q) => q.id));
      const invalid = body.answers.filter((a) => !allowedIds.has(a.questionId));
      if (invalid.length > 0) {
        return NextResponse.json({ error: "One or more questions are not part of this program's rating form" }, { status: 400 });
      }

      const response = await submitSignedInResponse({
        programId: body.programId,
        userId,
        answers: body.answers,
        ipHash: hashIp(ip),
      });
      return NextResponse.json({ ok: true, responseId: response.id, verified: true, status: "COUNTED" });
    }

    // Anonymous link-path submission -- implemented in Step 5.
    return NextResponse.json({ error: "Sign in to submit a rating" }, { status: 501 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to submit rating" }, { status: 500 });
  }
}
