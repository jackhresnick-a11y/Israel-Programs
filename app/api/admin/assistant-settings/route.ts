import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { upsertSiteContent } from "@/lib/siteContent";

const bodySchema = z.object({
  enabled: z.boolean(),
});

/** Admin-only: toggles whether the assistant widget is visible to non-admin visitors.
 * Admins can always see/use the widget regardless of this flag -- see
 * app/layout.tsx's gating read and app/api/assistant/route.ts's matching server-side
 * re-check. This does not affect whether AI is actually enabled (AI_ENABLED env) --
 * with AI off, the widget still works via NullProvider's deterministic fallback. */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { enabled } = bodySchema.parse(await request.json());
    await upsertSiteContent("assistantEnabled", enabled ? "true" : "false");
    return NextResponse.json({ enabled });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update assistant settings" }, { status: 500 });
  }
}
