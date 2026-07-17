import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { upsertSiteContent } from "@/lib/siteContent";
import { POLL_KILL_SWITCH_KEY } from "@/lib/pollResults";

const bodySchema = z.object({ on: z.boolean() });

export async function PATCH(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const { on } = bodySchema.parse(json);
    await upsertSiteContent(POLL_KILL_SWITCH_KEY, on ? "true" : "false");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update kill switch" }, { status: 500 });
  }
}
