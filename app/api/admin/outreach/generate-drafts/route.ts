import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { generateDrafts } from "@/lib/outreach";
import { getSiteContent } from "@/lib/siteContent";

const DEFAULT_SUBJECT = "Your {programName} listing on Israel Programs Wiki";
const DEFAULT_BODY = 'Hi {contactName|"there"},\n\n{programDescriptor} is listed at {listingUrl}. Please confirm it\'s accurate.';

/** Admin-only: generates DRAFT OutreachEmail rows for every eligible program missing
 * one, using the current SiteContent templates. Never overwrites a hand-edited or
 * already-actioned row (see lib/outreach.ts's generateDrafts). */
export async function POST() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const [subjectTemplate, bodyTemplate] = await Promise.all([
    getSiteContent("outreachSubjectTemplate"),
    getSiteContent("outreachBodyTemplate"),
  ]);

  try {
    const result = await generateDrafts(subjectTemplate ?? DEFAULT_SUBJECT, bodyTemplate ?? DEFAULT_BODY);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate drafts" }, { status: 500 });
  }
}
