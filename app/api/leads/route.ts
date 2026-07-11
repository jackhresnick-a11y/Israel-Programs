import { NextResponse, after } from "next/server";
import { ZodError } from "zod";
import { leadSchema, createLead } from "@/lib/leads";
import { sendContactEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, message, path, website } = leadSchema.parse(body);

    // Honeypot tripped: pretend success, do nothing.
    if (website) {
      return NextResponse.json({ ok: true });
    }

    const ip = getClientIp(request);
    if (!checkRateLimit(`lead:${ip}`)) {
      return NextResponse.json(
        { error: "Too many submissions — please try again later." },
        { status: 429 }
      );
    }

    // The DB row is the durable record, so it's awaited; the notification
    // email is best-effort and must not slow or fail the response.
    await createLead({ email, message, path });

    after(() =>
      sendContactEmail({
        subject: `New lead from ${path}`,
        text: `Email: ${email}\nPage: ${path}\n\n${message ?? "(no message)"}`,
        replyTo: email,
      })
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }
}
