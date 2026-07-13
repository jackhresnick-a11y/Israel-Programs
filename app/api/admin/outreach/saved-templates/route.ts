import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { listOutreachTemplates, createOutreachTemplate } from "@/lib/outreachTemplates";

const bodySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  subject: z.string().trim().min(1, "Subject is required"),
  body: z.string().trim().min(1, "Body is required"),
});

/** Admin-only: lists all saved, free-form outreach templates (distinct from the single
 * global template in SiteContent -- see /api/admin/outreach/templates). */
export async function GET() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const templates = await listOutreachTemplates();
  return NextResponse.json(templates);
}

/** Admin-only: creates a new saved template. Names are unique (schema constraint) --
 * a duplicate name returns 409 rather than a generic 500. */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const input = bodySchema.parse(await request.json());
    const template = await createOutreachTemplate(input);
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A template with that name already exists" }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
