import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { getSiteContent, upsertSiteContent, deleteSiteContent } from "@/lib/siteContent";
import { isVercelBlobUrl } from "@/lib/blob";

const HEADER_URL_KEY = "headerLogoUrl";
const HEADER_MODE_KEY = "headerLogoMode";
const BACKGROUND_URL_KEY = "backgroundLogoUrl";
const BACKGROUND_ENABLED_KEY = "backgroundLogoEnabled";

const postBodySchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("header"),
    url: z.string().refine(isVercelBlobUrl, "Invalid logo URL"),
    mode: z.enum(["replace", "alongside"]),
  }),
  z.object({
    target: z.literal("background"),
    url: z.string().refine(isVercelBlobUrl, "Invalid logo URL"),
  }),
]);

const patchBodySchema = z.object({
  target: z.literal("background"),
  enabled: z.boolean(),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = postBodySchema.parse(json);

    if (body.target === "header") {
      await upsertSiteContent(HEADER_URL_KEY, body.url);
      await upsertSiteContent(HEADER_MODE_KEY, body.mode);
      return NextResponse.json({ url: body.url, mode: body.mode });
    }

    await upsertSiteContent(BACKGROUND_URL_KEY, body.url);
    await upsertSiteContent(BACKGROUND_ENABLED_KEY, "true");
    return NextResponse.json({ url: body.url, enabled: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save site logo" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const { enabled } = patchBodySchema.parse(json);
    await upsertSiteContent(BACKGROUND_ENABLED_KEY, enabled ? "true" : "false");
    return NextResponse.json({ enabled });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update background logo" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { searchParams } = new URL(request.url);
  const target = searchParams.get("target") === "background" ? "background" : "header";
  const urlKey = target === "header" ? HEADER_URL_KEY : BACKGROUND_URL_KEY;

  try {
    const existingUrl = await getSiteContent(urlKey);
    if (existingUrl) {
      try {
        await del(existingUrl);
      } catch (err) {
        console.error("Failed to delete blob for", existingUrl, err);
      }
    }

    if (target === "header") {
      await deleteSiteContent(HEADER_URL_KEY);
      await deleteSiteContent(HEADER_MODE_KEY);
    } else {
      await deleteSiteContent(BACKGROUND_URL_KEY);
      await deleteSiteContent(BACKGROUND_ENABLED_KEY);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove site logo" }, { status: 500 });
  }
}
