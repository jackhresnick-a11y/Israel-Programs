import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { partnerLinksConfigSchema, savePartnerLinksConfig } from "@/lib/partnerLinks";

/**
 * Admin-only: replaces the entire Partner Links config (the single `partnerLinks`
 * SiteContent record). Authorization is enforced HERE, server-side, on the write path --
 * hiding the admin UI is not sufficient. The whole config is validated with the same
 * schema the resolver parses against, so a slot with a non-http(s) url (or an over-length
 * field, or an unknown placement/scope) is rejected at write time rather than silently
 * dropped at read time.
 */
export async function PATCH(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const config = partnerLinksConfigSchema.parse(await request.json());
    await savePartnerLinksConfig(config);
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save partner links" }, { status: 500 });
  }
}
