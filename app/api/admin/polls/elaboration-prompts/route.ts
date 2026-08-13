import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { elaborationPromptsConfigSchema, saveElaborationPromptsConfig } from "@/lib/pollElaborationPrompts";

/**
 * Admin-only: replaces the entire elaboration-prompts config (the single
 * `pollElaborationPrompts` SiteContent record). Authorization is enforced HERE,
 * server-side, on the write path -- hiding the admin UI is not sufficient. The whole
 * config is validated with the same schema the resolver parses against, same posture as
 * PATCH /api/admin/partner-links.
 */
export async function PATCH(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const config = elaborationPromptsConfigSchema.parse(await request.json());
    await saveElaborationPromptsConfig(config);
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save elaboration prompts" }, { status: 500 });
  }
}
