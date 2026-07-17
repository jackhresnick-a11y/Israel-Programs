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
 * caller can refuse the whole batch with a clear reason before attempting any send.
 *
 * Tolerates the two most common paste mistakes when setting the value in a dashboard
 * (surrounding quotes, leading/trailing whitespace) rather than rejecting an
 * otherwise-correct value outright -- a stray `"..."` or trailing space around an
 * env var is easy to introduce and easy to miss, and the previous strict version had
 * no way to surface *why* a seemingly-correct-looking value was being rejected. This
 * does not tolerate an actual domain typo -- that still returns null, correctly. */
export function getOutreachFromAddress(): string | null {
  const raw = process.env.RESEND_FROM;
  if (!raw) return null;

  let from = raw.trim();
  if (from.length >= 2) {
    const first = from[0];
    const last = from[from.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      from = from.slice(1, -1).trim();
    }
  }
  if (!from) return null;

  // Accepts either a bare address or "Display Name <address>" and checks the
  // domain of the actual address, not the display name.
  const match = from.match(/<([^>]+)>/);
  const address = match ? match[1] : from;
  return address.toLowerCase().endsWith(OUTREACH_DOMAIN) ? from : null;
}

const DEFAULT_OUTREACH_REPLY_TO = "jackhresnick@gmail.com";

/** Extracts and cleans REPLY_TO_ADDRESS the same way getOutreachFromAddress cleans
 * RESEND_FROM (trims whitespace, strips one layer of surrounding quotes -- the same
 * paste-mistake tolerance). Unlike getOutreachFromAddress, this never returns null and
 * has no domain restriction: Reply-To has no DKIM/SPF/DMARC implications (those apply
 * to From, which stays on israelprogramswiki.com), so it can point at any inbox the
 * admin actually reads -- falls back to DEFAULT_OUTREACH_REPLY_TO when unset or empty
 * after cleanup, so outreach always has a Reply-To without requiring the env var. */
export function getOutreachReplyToAddress(): string {
  const raw = process.env.REPLY_TO_ADDRESS;
  if (!raw) return DEFAULT_OUTREACH_REPLY_TO;

  let address = raw.trim();
  if (address.length >= 2) {
    const first = address[0];
    const last = address[address.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      address = address.slice(1, -1).trim();
    }
  }
  return address || DEFAULT_OUTREACH_REPLY_TO;
}

export type OutreachEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export type OutreachSendResult = { ok: true; resendId: string } | { ok: false; error: string };

/** Extracts and cleans OUTREACH_BCC the same way getOutreachReplyToAddress cleans
 * REPLY_TO_ADDRESS (trims whitespace, strips one layer of surrounding quotes). Unlike
 * REPLY_TO_ADDRESS, BCC is optional -- absence means "don't BCC anyone," not "fall back
 * to a default," so this returns null rather than a hardcoded address. Used to route a
 * copy of every sent outreach email into the admin's own inbox (see sendOutreachEmail). */
export function getOutreachBccAddress(): string | null {
  const raw = process.env.OUTREACH_BCC;
  if (!raw) return null;

  let address = raw.trim();
  if (address.length >= 2) {
    const first = address[0];
    const last = address[address.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      address = address.slice(1, -1).trim();
    }
  }
  return address || null;
}

/**
 * Sends one outreach email. Distinct from sendContactEmail: returns the Resend
 * message id (needed to correlate bounce webhooks back to the OutreachEmail row) and
 * a specific error string instead of a bare boolean, and refuses outright if
 * getOutreachFromAddress() can't produce a domain-valid sender -- there is no
 * onboarding@resend.dev fallback here. Sets Reply-To (getOutreachReplyToAddress) so a
 * program's reply lands in a real inbox the admin checks, since RESEND_FROM is a
 * send-only address with no mailbox of its own. Also BCCs getOutreachBccAddress() (if
 * set) so a copy of every sent email lands in that same inbox for recordkeeping.
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
      replyTo: getOutreachReplyToAddress(),
      bcc: getOutreachBccAddress() ?? undefined,
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

export type PollVerifyEmailInput = {
  to: string;
  programName: string;
  verifyUrl: string;
};

/**
 * Sends the alumni-ratings magic-link verification email. Reuses getOutreachFromAddress
 * -- this is a program-facing, alum-facing transactional email just like outreach, so it
 * needs the same domain-valid sender, not the onboarding@resend.dev fallback. Simpler
 * than sendOutreachEmail otherwise (no BCC -- this isn't a batch send an admin needs a
 * copy of). Never throws, following this file's convention: lib/pollResponses.ts's
 * attachEmailAndSendVerification leaves the response PENDING on a failed send rather
 * than erroring the request, and surfaces the failure to the thank-you screen so the
 * alum can retry.
 */
export async function sendPollVerifyEmail(input: PollVerifyEmailInput): Promise<OutreachSendResult> {
  const from = getOutreachFromAddress();
  if (!from) {
    return { ok: false, error: "RESEND_FROM is not set to an address on israelprogramswiki.com" };
  }

  const resend = getResend();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  const subject = `Confirm your rating of ${input.programName}`;
  const text =
    `Thanks for rating ${input.programName}!\n\n` +
    `Click this link to confirm your email and make your rating count toward the public score:\n${input.verifyUrl}\n\n` +
    `This link expires in 7 days. If you didn't submit a rating, you can ignore this email.`;

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      replyTo: getOutreachReplyToAddress(),
      subject,
      text,
    });
    if (error || !data) {
      console.error("[poll verify email] Resend returned an error", error);
      return { ok: false, error: error?.message ?? "Resend returned no message id" };
    }
    return { ok: true, resendId: data.id };
  } catch (err) {
    console.error("[poll verify email] send failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown send error" };
  }
}

export type TestEmailTemplate = "contact" | "verification" | "outreach";

export type TestEmailResult = OutreachSendResult & { from?: string };

const TEST_SAMPLES: Record<TestEmailTemplate, { subject: string; text: string }> = {
  contact: {
    subject: "Contact form: Test Sender",
    text: "From: Test Sender <test@example.com>\n\nThis is a test of the contact-form notification email.",
  },
  // The app does not send a "verify your listing" email to programs today (see
  // lib/outreach.ts) -- this sample exists purely so the admin can preview the
  // copy/formatting and confirm inbox routing, not because a real send path uses it.
  verification: {
    subject: "Please verify your program listing on Israel Programs Wiki",
    text: "Hi,\n\nThis is a sample verification-request email. It previews the copy and confirms inbox routing -- the app does not currently send this automatically.",
  },
  outreach: {
    subject: "Verify your listing on Israel Programs Wiki",
    text: "Hi,\n\nThis is a sample outreach email, rendered as a preview of the real 'verify your listing' template that programs receive.",
  },
};

/**
 * Sends a sample of one of the three email templates to any destination on demand, for
 * previewing copy and confirming inbox routing from the admin Test Email panel. Mirrors
 * sendOutreachEmail's from/replyTo/bcc resolution rather than duplicating it -- the
 * "outreach" template must use the real getOutreachFromAddress() (so a test surfaces the
 * same "RESEND_FROM not set to an israelprogramswiki.com address" failure the real send
 * path would hit), while contact/verification use the same onboarding@resend.dev
 * fallback as sendContactEmail since neither has a domain restriction.
 */
export async function sendTestEmail(input: { to: string; template: TestEmailTemplate }): Promise<TestEmailResult> {
  const sample = TEST_SAMPLES[input.template];

  const from = input.template === "outreach" ? getOutreachFromAddress() : process.env.RESEND_FROM ?? "onboarding@resend.dev";
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
      replyTo: getOutreachReplyToAddress(),
      bcc: getOutreachBccAddress() ?? undefined,
      subject: `[TEST] ${sample.subject}`,
      text: sample.text,
    });
    if (error || !data) {
      console.error("[test email] Resend returned an error", error);
      return { ok: false, error: error?.message ?? "Resend returned no message id", from };
    }
    return { ok: true, resendId: data.id, from };
  } catch (err) {
    console.error("[test email] send failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown send error", from };
  }
}
