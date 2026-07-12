import { NextResponse } from "next/server";
import { getResend } from "@/lib/email";
import { markOutreachBouncedByResendId } from "@/lib/outreach";

/**
 * Resend webhook endpoint (register at https://israelprogramswiki.com/api/webhooks/resend
 * for the email.bounced event in the Resend dashboard). Not behind Clerk's auth gate --
 * proxy.ts's isProtectedRoute matcher only covers /admin(.*), and Resend's own request
 * carries no Clerk session anyway. Authenticity instead comes from verifying Resend's
 * signature (resend.webhooks.verify(), an HMAC check against RESEND_WEBHOOK_SECRET --
 * the SDK wraps the same svix scheme Resend's docs describe, no separate svix
 * dependency needed since it's already a method on the resend package we have).
 *
 * Only email.bounced is acted on. Every other event type (delivered/opened/clicked/
 * complained/etc.) is accepted and ignored -- Resend may deliver whatever event types
 * the dashboard subscription is configured for, and this route only needs the one.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[resend webhook] RESEND_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const resend = getResend();
  if (!resend) {
    console.error("[resend webhook] RESEND_API_KEY is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Critical: the signature is computed over the exact raw bytes. Reading as text
  // (not request.json()) preserves that -- parsing first and re-serializing would
  // very likely change whitespace/key order and break verification.
  const payload = await request.text();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }

  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    });
  } catch (err) {
    console.error("[resend webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "email.bounced") {
    const { email_id, bounce } = event.data;
    const note = `Resend bounce (${bounce.type}/${bounce.subType}): ${bounce.message}`;
    try {
      const updated = await markOutreachBouncedByResendId(email_id, note);
      if (!updated) {
        console.log("[resend webhook] bounce for unmatched email_id (not an outreach send)", email_id);
      }
    } catch (err) {
      console.error("[resend webhook] failed to record bounce", email_id, err);
      return NextResponse.json({ error: "Failed to record bounce" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
