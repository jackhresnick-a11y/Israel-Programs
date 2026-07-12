import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { getSiteContent, upsertSiteContent } from "@/lib/siteContent";

const TEMPLATE_KEYS = ["outreachSubjectTemplate", "outreachBodyTemplate", "outreachBatchSize"] as const;

/** Admin-only: reads the current outreach subject/body templates + batch size. */
export async function GET() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const [subject, body, batchSize] = await Promise.all(TEMPLATE_KEYS.map((k) => getSiteContent(k)));
  return NextResponse.json({
    outreachSubjectTemplate: subject ?? "",
    outreachBodyTemplate: body ?? "",
    outreachBatchSize: batchSize ?? "30",
  });
}

const bodySchema = z.object({
  outreachSubjectTemplate: z.string().trim().min(1).optional(),
  outreachBodyTemplate: z.string().trim().min(1).optional(),
  outreachBatchSize: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) > 0, "Must be a positive whole number")
    .optional(),
});

/** Admin-only: updates one or more outreach template SiteContent keys. */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const input = bodySchema.parse(await request.json());
    await Promise.all(
      Object.entries(input)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([key, value]) => upsertSiteContent(key, value))
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update templates" }, { status: 500 });
  }
}
