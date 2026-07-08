import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { upsertSiteContent } from "@/lib/siteContent";
import { MAX_ITEMS } from "@/lib/recentlyAdded";

const itemSchema = z.object({
  slug: z.string().min(1),
  videoId: z.string().min(1).optional(),
});

const patchBodySchema = z
  .object({
    heading: z.string().trim().min(1).max(120).optional(),
    mode: z.enum(["auto", "manual"]).optional(),
    items: z.array(itemSchema).max(MAX_ITEMS).optional(),
  })
  .refine(
    (b) => b.heading !== undefined || b.mode !== undefined || b.items !== undefined,
    "No changes provided"
  );

export async function PATCH(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const { heading, mode, items } = patchBodySchema.parse(json);

    if (heading !== undefined) {
      await upsertSiteContent("recentlyAddedHeading", heading);
    }
    if (mode !== undefined) {
      await upsertSiteContent("recentlyAddedMode", mode);
    }
    if (items !== undefined) {
      await upsertSiteContent("recentlyAddedItems", JSON.stringify(items));
    }

    return NextResponse.json({ heading, mode, items });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update recently added settings" }, { status: 500 });
  }
}
