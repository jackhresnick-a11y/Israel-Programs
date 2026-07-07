import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { getSiteContent, upsertSiteContent, deleteSiteContent } from "@/lib/siteContent";
import { isVercelBlobUrl } from "@/lib/blob";

const LOGO_URL_KEY = "headerLogoUrl";
const LOGO_MODE_KEY = "headerLogoMode";

const bodySchema = z.object({
  url: z.string().refine(isVercelBlobUrl, "Invalid logo URL"),
  mode: z.enum(["replace", "alongside"]),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const { url, mode } = bodySchema.parse(json);
    await upsertSiteContent(LOGO_URL_KEY, url);
    await upsertSiteContent(LOGO_MODE_KEY, mode);
    return NextResponse.json({ url, mode });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save site logo" }, { status: 500 });
  }
}

export async function DELETE() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const existingUrl = await getSiteContent(LOGO_URL_KEY);
    if (existingUrl) {
      try {
        await del(existingUrl);
      } catch (err) {
        console.error("Failed to delete blob for", existingUrl, err);
      }
    }
    await deleteSiteContent(LOGO_URL_KEY);
    await deleteSiteContent(LOGO_MODE_KEY);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove site logo" }, { status: 500 });
  }
}
