import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { upsertSiteContent } from "@/lib/siteContent";

const bodySchema = z.object({
  enabled: z.boolean(),
});

/** Admin-only: toggles whether the whole /glossary section is reachable by non-admin
 * visitors. Admins can always reach it regardless of this flag -- see
 * app/glossary/page.tsx and app/glossary/[slug]/page.tsx's matching server-side
 * re-check. Default is off (no row yet reads as "false") until the real definitions
 * replace the placeholder copy. */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { enabled } = bodySchema.parse(await request.json());
    await upsertSiteContent("glossaryEnabled", enabled ? "true" : "false");
    return NextResponse.json({ enabled });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update glossary settings" }, { status: 500 });
  }
}
