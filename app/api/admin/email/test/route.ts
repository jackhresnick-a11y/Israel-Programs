import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { sendTestEmail, type TestEmailTemplate } from "@/lib/email";

const TEMPLATES: TestEmailTemplate[] = ["contact", "verification", "outreach"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const body = await request.json().catch(() => null);
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const template = body?.template;

  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "Enter a valid destination email address." }, { status: 400 });
  }
  if (!TEMPLATES.includes(template)) {
    return NextResponse.json({ error: "template must be one of: contact, verification, outreach" }, { status: 400 });
  }

  const result = await sendTestEmail({ to, template });
  return NextResponse.json({ ...result, to });
}
