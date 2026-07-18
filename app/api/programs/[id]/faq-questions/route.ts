import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { hashIp } from "@/lib/pollIntegrity";
import { faqQuestionSubmitSchema } from "@/lib/programFaqShared";
import { submitVisitorQuestion } from "@/lib/programFaq";

type Params = { params: Promise<{ id: string }> };

/** Open to all visitors, no sign-in -- same posture as the anonymous poll-review path
 * and app/api/contact/route.ts. Honeypot is checked before the rate limit, same order
 * as contact/route.ts, so a bot never learns a limiter exists. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  try {
    const json = await request.json();
    const body = faqQuestionSubmitSchema.parse(json);

    if (body.website) {
      return NextResponse.json({ ok: true });
    }

    const ip = getClientIp(request);
    if (!checkRateLimit(`faq-question:${ip}`, { limit: 10, windowMs: 10 * 60_000 })) {
      return NextResponse.json({ error: "Too many questions -- try again in a few minutes" }, { status: 429 });
    }

    const program = await prisma.program.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!program || program.status !== "PUBLISHED") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }

    await submitVisitorQuestion({ programId: id, question: body.question, ipHash: hashIp(ip) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to submit question" }, { status: 500 });
  }
}
