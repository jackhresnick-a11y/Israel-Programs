import { Resend } from "resend";

let client: Resend | null = null;

function getResend(): Resend | null {
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
