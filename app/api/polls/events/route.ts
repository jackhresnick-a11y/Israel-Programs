import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { pollClientEventSchema } from "@/lib/pollShared";
import { trackPollShare } from "@/lib/pollAnalytics";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Client-triggered analytics beacon for the poll events that have no server round trip to
 * piggyback on: the two post-poll share events (share_button_shown / share_button_clicked,
 * see components/polls/WhatsAppShareButton.tsx) and the reference opt-in's
 * reference_optin_viewed / reference_optin_focused (see RateForm.tsx's
 * ReferenceOptInBlock). Both are things the respondent did in the page that never reach
 * the server otherwise. Every other poll analytics event is emitted server-side from an
 * existing route -- including reference_optin_submitted, which is deliberately NOT
 * accepted here (the schema's enum excludes it), because whether an opt-in produced a
 * Reference is a server fact and must not be assertable by a client.
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
    const body = pollClientEventSchema.parse(json);

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
