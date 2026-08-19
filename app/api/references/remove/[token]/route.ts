import { NextResponse } from "next/server";
import { removeReferenceByToken } from "@/lib/references";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Self-removal for a reference-giver. No auth: the token is the capability, same as the
 * sibling contact-request approve/decline routes. Rate-limited per IP purely as spam
 * friction against someone spraying guessed tokens -- guessing a 192-bit token is not a
 * realistic attack, but there is no reason to leave it unmetered.
 *
 * POST rather than GET because the page's button is the only intended trigger; a GET with
 * a side effect would let an email scanner or a browser prefetch unlist someone who never
 * pressed anything.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`reference-remove:${ip}`, { limit: 10, windowMs: 10 * 60_000 })) {
      return NextResponse.json({ error: "Too many requests — try again in a few minutes" }, { status: 429 });
    }

    const { token } = await params;
    const result = await removeReferenceByToken(token);
    if (!result.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, alreadyRemoved: result.alreadyRemoved });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove" }, { status: 500 });
  }
}
