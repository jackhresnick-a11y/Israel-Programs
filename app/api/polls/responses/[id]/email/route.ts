import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { emailAttachSchema } from "@/lib/pollShared";
import { attachEmailAndSendVerification } from "@/lib/pollResponses";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * The thank-you screen's optional "want your rating to count?" email step. Rate-limited
 * tighter than most public routes (5/10min per IP) since each successful call sends a
 * real email through Resend.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ip = getClientIp(request);
    if (!checkRateLimit(`poll-email:${ip}`, { limit: 5, windowMs: 10 * 60_000 })) {
      return NextResponse.json({ error: "Too many requests -- try again in a few minutes" }, { status: 429 });
    }

    const json = await request.json();
    const { email } = emailAttachSchema.parse(json);

    const response = await prisma.pollResponse.findUnique({
      where: { id },
      select: { program: { select: { name: true } } },
    });
    if (!response) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await attachEmailAndSendVerification(id, email, response.program.name);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 });
  }
}
