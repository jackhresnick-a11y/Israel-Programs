import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { generateDrafts } from "@/lib/outreach";
import { getSiteContent } from "@/lib/siteContent";
import { getOutreachTemplate } from "@/lib/outreachTemplates";

const DEFAULT_SUBJECT = "Your {programName} listing on Israel Programs Wiki";
const DEFAULT_BODY = 'Hi {contactName|"there"},\n\n{programDescriptor} is listed at {listingUrl}. Please confirm it\'s accurate.';

const bodySchema = z.object({
  programIds: z.array(z.string()).min(1).optional(),
  // When set, use this saved OutreachTemplate's subject/body instead of the global
  // SiteContent template -- the "pick a template at generate time" flow. Omitted
  // means "Default (global template)," the original behavior.
  templateId: z.string().min(1).optional(),
});

/** Admin-only: generates DRAFT OutreachEmail rows using either a saved OutreachTemplate
 * (when `templateId` is given) or the current SiteContent global template (fallback).
 * With an optional `programIds` body, restricts the run to exactly those programs (the
 * "Generate drafts for selected" flow) -- omitted or an empty/no body generates for
 * every eligible program missing one (the "Generate all" flow), the original behavior.
 * Never overwrites a hand-edited or already-actioned row (see lib/outreach.ts's
 * generateDrafts). */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  let programIds: string[] | undefined;
  let templateId: string | undefined;
  try {
    const raw = await request.text();
    if (raw) {
      const parsed = bodySchema.parse(JSON.parse(raw));
      programIds = parsed.programIds;
      templateId = parsed.templateId;
    }
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let subjectTemplate: string;
  let bodyTemplate: string;

  if (templateId) {
    const saved = await getOutreachTemplate(templateId);
    if (!saved) {
      return NextResponse.json({ error: "Selected template not found" }, { status: 400 });
    }
    subjectTemplate = saved.subject;
    bodyTemplate = saved.body;
  } else {
    const [subject, body] = await Promise.all([
      getSiteContent("outreachSubjectTemplate"),
      getSiteContent("outreachBodyTemplate"),
    ]);
    subjectTemplate = subject ?? DEFAULT_SUBJECT;
    bodyTemplate = body ?? DEFAULT_BODY;
  }

  try {
    const result = await generateDrafts(subjectTemplate, bodyTemplate, programIds);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate drafts" }, { status: 500 });
  }
}
