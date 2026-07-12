import { Resend } from "resend";

let client: Resend | null = null;

/** Exported so app/api/webhooks/resend/route.ts can call resend.webhooks.verify() --
 * webhook signature verification is a method on the SDK client, not a standalone
 * export, even though it's a pure local HMAC check that doesn't call out to Resend. */
export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export type ContactEmailInput = {
  subject: string;
  text: string;
  replyTo: string;
};

/**
 * Sends a plain-text notification email. Never throws — a missing API key,
 * missing CONTACT_EMAIL, or a Resend-side failure all resolve to `false` so
 * callers can fall back to the mailto link instead of erroring the request.
 */
export async function sendContactEmail(input: ContactEmailInput): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.error("[email] RESEND_API_KEY missing — send skipped");
    return false;
  }

  const to = process.env.CONTACT_EMAIL;
  if (!to) {
    console.error("[email] CONTACT_EMAIL missing — send skipped");
    return false;
  }

  const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.text,
    });
    if (error) {
      console.error("[email] Resend returned an error", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed", err);
    return false;
  }
}

const OUTREACH_DOMAIN = "@israelprogramswiki.com";

/** Extracts and validates the sender address for outreach sends. Unlike
 * sendContactEmail (which falls back to onboarding@resend.dev), outreach never sends
 * from a shared/test address -- a program-facing "verify your listing" email must
 * come from the site's own domain (also required for the DKIM/SPF/DMARC records to
 * mean anything). Returns null if RESEND_FROM is unset or not on that domain, so the
 * caller can refuse the whole batch with a clear reason before attempting any send. */
export function getOutreachFromAddress(): string | null {
  const from = process.env.RESEND_FROM;
  if (!from) return null;
  // Accepts either a bare address or "Display Name <address>" and checks the
  // domain of the actual address, not the display name.
  const match = from.match(/<([^>]+)>/);
  const address = match ? match[1] : from;
  return address.toLowerCase().endsWith(OUTREACH_DOMAIN) ? from : null;
}

export type OutreachEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export type OutreachSendResult = { ok: true; resendId: string } | { ok: false; error: string };

/**
 * Sends one outreach email. Distinct from sendContactEmail: returns the Resend
 * message id (needed to correlate bounce webhooks back to the OutreachEmail row) and
 * a specific error string instead of a bare boolean, and refuses outright if
 * getOutreachFromAddress() can't produce a domain-valid sender -- there is no
 * onboarding@resend.dev fallback here.
 */
export async function sendOutreachEmail(input: OutreachEmailInput): Promise<OutreachSendResult> {
  const from = getOutreachFromAddress();
  if (!from) {
    return { ok: false, error: "RESEND_FROM is not set to an address on israelprogramswiki.com" };
  }

  const resend = getResend();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    if (error || !data) {
      console.error("[outreach email] Resend returned an error", error);
      return { ok: false, error: error?.message ?? "Resend returned no message id" };
    }
    return { ok: true, resendId: data.id };
  } catch (err) {
    console.error("[outreach email] send failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown send error" };
  }
}
