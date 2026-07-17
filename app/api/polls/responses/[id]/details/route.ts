import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { answerListSchema } from "@/lib/pollShared";
import { addDetailAnswers } from "@/lib/pollResponses";
import { getQuestionsForProgram } from "@/lib/pollConfig";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const bodySchema = z.object({ answers: answerListSchema });

/**
 * Adds "Add more detail" (non-core bucket) answers to a still-pending anonymous
 * response, after the initial submit -- the responseId in the URL is a bare capability
 * (no auth on this route), so every check here matters: rate-limited by IP,
 * question-id allowlist re-derived from the program's live config (never trust the
 * client's questionId set), and addDetailAnswers itself refuses anything not PENDING.
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
    const { answers } = bodySchema.parse(json);

    const response = await prisma.pollResponse.findUnique({ where: { id }, select: { programId: true } });
    if (!response) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { core, extras } = await getQuestionsForProgram(response.programId);
    const allowedIds = new Set([...core.map((q) => q.id), ...extras.flatMap((e) => e.questions.map((q) => q.id))]);
    const invalid = answers.filter((a) => !allowedIds.has(a.questionId));
    if (invalid.length > 0) {
      return NextResponse.json({ error: "One or more questions are not part of this program's rating form" }, { status: 400 });
    }

    await addDetailAnswers(id, answers);
    return NextResponse.json({ ok: true });
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
