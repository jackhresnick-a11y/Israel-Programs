import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { pollShareEventSchema } from "@/lib/pollShared";
import { trackPollShare } from "@/lib/pollAnalytics";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Client-triggered analytics beacon for the two post-poll share events
 * (share_button_shown / share_button_clicked -- see components/polls/WhatsAppShareButton.tsx
 * and lib/pollClientEvents.ts). Every other poll analytics event is emitted server-side
 * from an existing autosave route; this is the one place a client component needs to log
 * something directly, since "the respondent tapped the WhatsApp share link" has no other
 * server round trip to piggyback on.
 *
 * Always 204, even on a bad body or an unknown responseId -- analytics must never surface
 * an error to the UI, and the client's fetch is fire-and-forget (`keepalive: true`) so
 * there's nothing useful it could do with a 4xx anyway. `programId` is deliberately never
 * accepted from the client -- it's looked up from `responseId` server-side, so a crafted
 * request can't attribute a share to a program it didn't happen on.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`poll-event:${ip}`, { limit: 20, windowMs: 10 * 60_000 })) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const json = await request.json();
    const body = pollShareEventSchema.parse(json);

    const response = await prisma.pollResponse.findUnique({
      where: { id: body.responseId },
      select: { programId: true },
    });
    if (!response) {
      return new NextResponse(null, { status: 204 });
    }

    trackPollShare(body.type, response.programId, body.responseId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ZodError) {
      return new NextResponse(null, { status: 204 });
    }
    console.error("[poll-events]", err);
    return new NextResponse(null, { status: 204 });
  }
}
