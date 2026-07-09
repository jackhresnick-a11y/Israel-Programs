import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { upsertSiteContent } from "@/lib/siteContent";
import { VALID_TINTS } from "@/lib/tagTints";

const tintSchema = z.enum(VALID_TINTS as [string, ...string[]]);

const patchBodySchema = z
  .object({
    target: z.enum(["duration", "region"]),
    label: z.string().trim().min(1).max(60).optional(),
    tint: tintSchema.optional(),
    showInFilter: z.boolean().optional(),
  })
  .refine(
    (b) => b.label !== undefined || b.tint !== undefined || b.showInFilter !== undefined,
    "No changes provided"
  );

// SiteContent keys for the two special-cased filter-bar dropdown headers (Duration,
// Region) -- these aren't TagCategory rows (see prisma/schema.prisma's comment on
// TagCategory), so their label/tint/visibility live as plain SiteContent keys instead,
// the same pattern app/api/admin/logo/route.ts uses for the site branding settings.
const KEYS = {
  duration: { label: "durationFilterLabel", tint: "durationFilterTint", show: "durationFilterShow" },
  region: { label: "regionFilterLabel", tint: "regionFilterTint", show: "regionFilterShow" },
} as const;

export async function PATCH(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const { target, label, tint, showInFilter } = patchBodySchema.parse(json);
    const keys = KEYS[target];

    if (label !== undefined) await upsertSiteContent(keys.label, label);
    if (tint !== undefined) await upsertSiteContent(keys.tint, tint);
    if (showInFilter !== undefined) await upsertSiteContent(keys.show, showInFilter ? "true" : "false");

    return NextResponse.json({ target, label, tint, showInFilter });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update filter config" }, { status: 500 });
  }
}
