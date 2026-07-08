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
const BACKGROUND_SIZE_KEY = "backgroundLogoSize";
const BACKGROUND_OPACITY_KEY = "backgroundLogoOpacity";

const DEFAULT_BACKGROUND_SIZE = 280; // px height
const DEFAULT_BACKGROUND_OPACITY = 5; // percent

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

const patchBodySchema = z
  .object({
    target: z.literal("background"),
    enabled: z.boolean().optional(),
    size: z.number().int().min(80).max(600).optional(),
    opacity: z.number().int().min(1).max(60).optional(),
  })
  .refine(
    (b) => b.enabled !== undefined || b.size !== undefined || b.opacity !== undefined,
    "No changes provided"
  );

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
    // Only seed defaults the first time an image is set, so re-uploading a
    // replacement image doesn't reset a size/opacity the admin already tuned.
    if ((await getSiteContent(BACKGROUND_SIZE_KEY)) === null) {
      await upsertSiteContent(BACKGROUND_SIZE_KEY, String(DEFAULT_BACKGROUND_SIZE));
    }
    if ((await getSiteContent(BACKGROUND_OPACITY_KEY)) === null) {
      await upsertSiteContent(BACKGROUND_OPACITY_KEY, String(DEFAULT_BACKGROUND_OPACITY));
    }
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
    const { enabled, size, opacity } = patchBodySchema.parse(json);
    if (enabled !== undefined) {
      await upsertSiteContent(BACKGROUND_ENABLED_KEY, enabled ? "true" : "false");
    }
    if (size !== undefined) {
      await upsertSiteContent(BACKGROUND_SIZE_KEY, String(size));
    }
    if (opacity !== undefined) {
      await upsertSiteContent(BACKGROUND_OPACITY_KEY, String(opacity));
    }
    return NextResponse.json({ enabled, size, opacity });
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
      await deleteSiteContent(BACKGROUND_SIZE_KEY);
      await deleteSiteContent(BACKGROUND_OPACITY_KEY);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove site logo" }, { status: 500 });
  }
}
