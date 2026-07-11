import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { sendContactEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.email("Enter a valid email").max(320),
  message: z.string().trim().min(1, "Message is required").max(5000),
  // Honeypot — real users never see or fill this field.
  website: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, message, website } = contactSchema.parse(body);

    // Honeypot tripped: pretend success, do nothing. Checked before the rate
    // limit so a bot never learns a limiter exists.
    if (website) {
      return NextResponse.json({ ok: true });
    }

    const ip = getClientIp(request);
    if (!checkRateLimit(`contact:${ip}`)) {
      return NextResponse.json(
        { error: "Too many messages — please try again later or email us directly." },
        { status: 429 }
      );
    }

    const sent = await sendContactEmail({
      subject: `Contact form: ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
      replyTo: email,
    });

    if (!sent) {
      return NextResponse.json(
        { error: "We couldn't send your message right now." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
