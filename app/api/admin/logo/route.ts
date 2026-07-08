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
const BACKGROUND_OPACITY_KEY = "backgroundLogoOpacity";
// "Size"/"OffsetY" (no suffix) are the desktop values -- the original single-
// breakpoint keys, kept as-is so an admin's existing desktop tuning survives
// this feature adding mobile as a second, independent breakpoint.
const BACKGROUND_SIZE_DESKTOP_KEY = "backgroundLogoSize";
const BACKGROUND_SIZE_MOBILE_KEY = "backgroundLogoSizeMobile";
const BACKGROUND_OFFSET_Y_DESKTOP_KEY = "backgroundLogoOffsetY";
const BACKGROUND_OFFSET_Y_MOBILE_KEY = "backgroundLogoOffsetYMobile";

const DEFAULT_BACKGROUND_OPACITY = 5; // percent
const DEFAULT_BACKGROUND_SIZE_DESKTOP = 280; // px height
const DEFAULT_BACKGROUND_SIZE_MOBILE = 150; // px height, smaller for narrow screens
const DEFAULT_BACKGROUND_OFFSET_Y = 0; // px, relative to vertical center

const HOME_URL_KEY = "homeLogoUrl";
const HOME_ENABLED_KEY = "homeLogoEnabled";
const HOME_SIZE_DESKTOP_KEY = "homeLogoSize";
const HOME_SIZE_MOBILE_KEY = "homeLogoSizeMobile";
const HOME_OFFSET_X_DESKTOP_KEY = "homeLogoOffsetX";
const HOME_OFFSET_X_MOBILE_KEY = "homeLogoOffsetXMobile";
const HOME_OFFSET_Y_DESKTOP_KEY = "homeLogoOffsetY";
const HOME_OFFSET_Y_MOBILE_KEY = "homeLogoOffsetYMobile";
const HOME_LAYER_DESKTOP_KEY = "homeLogoLayer";
const HOME_LAYER_MOBILE_KEY = "homeLogoLayerMobile";

const DEFAULT_HOME_SIZE_DESKTOP = 320; // px height
const DEFAULT_HOME_SIZE_MOBILE = 160; // px height, smaller for narrow screens
const DEFAULT_HOME_OFFSET = 0; // px, relative to centered anchor
const DEFAULT_HOME_LAYER = "back"; // "back" = behind hero text (matches original behavior)

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
  z.object({
    target: z.literal("home"),
    url: z.string().refine(isVercelBlobUrl, "Invalid logo URL"),
  }),
]);

const backgroundPatchSchema = z.object({
  target: z.literal("background"),
  enabled: z.boolean().optional(),
  opacity: z.number().int().min(1).max(60).optional(),
  sizeDesktop: z.number().int().min(80).max(600).optional(),
  sizeMobile: z.number().int().min(80).max(600).optional(),
  offsetYDesktop: z.number().int().min(-300).max(300).optional(),
  offsetYMobile: z.number().int().min(-300).max(300).optional(),
});

const homePatchSchema = z.object({
  target: z.literal("home"),
  enabled: z.boolean().optional(),
  sizeDesktop: z.number().int().min(20).max(800).optional(),
  sizeMobile: z.number().int().min(20).max(800).optional(),
  offsetXDesktop: z.number().int().min(-1200).max(1200).optional(),
  offsetXMobile: z.number().int().min(-1200).max(1200).optional(),
  offsetYDesktop: z.number().int().min(-1200).max(1200).optional(),
  offsetYMobile: z.number().int().min(-1200).max(1200).optional(),
  layerDesktop: z.enum(["front", "back"]).optional(),
  layerMobile: z.enum(["front", "back"]).optional(),
});

const patchBodySchema = z
  .discriminatedUnion("target", [backgroundPatchSchema, homePatchSchema])
  .refine(
    (b) => Object.entries(b).some(([key, value]) => key !== "target" && value !== undefined),
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

    if (body.target === "background") {
      await upsertSiteContent(BACKGROUND_URL_KEY, body.url);
      await upsertSiteContent(BACKGROUND_ENABLED_KEY, "true");
      // Only seed defaults the first time an image is set, so re-uploading a
      // replacement image doesn't reset appearance settings the admin already tuned.
      const seeds: [string, string][] = [
        [BACKGROUND_OPACITY_KEY, String(DEFAULT_BACKGROUND_OPACITY)],
        [BACKGROUND_SIZE_DESKTOP_KEY, String(DEFAULT_BACKGROUND_SIZE_DESKTOP)],
        [BACKGROUND_SIZE_MOBILE_KEY, String(DEFAULT_BACKGROUND_SIZE_MOBILE)],
        [BACKGROUND_OFFSET_Y_DESKTOP_KEY, String(DEFAULT_BACKGROUND_OFFSET_Y)],
        [BACKGROUND_OFFSET_Y_MOBILE_KEY, String(DEFAULT_BACKGROUND_OFFSET_Y)],
      ];
      for (const [key, value] of seeds) {
        if ((await getSiteContent(key)) === null) {
          await upsertSiteContent(key, value);
        }
      }
      return NextResponse.json({ url: body.url, enabled: true });
    }

    await upsertSiteContent(HOME_URL_KEY, body.url);
    await upsertSiteContent(HOME_ENABLED_KEY, "true");
    // Only seed defaults the first time an image is set, so re-uploading a
    // replacement image doesn't reset appearance settings the admin already tuned.
    const homeSeeds: [string, string][] = [
      [HOME_SIZE_DESKTOP_KEY, String(DEFAULT_HOME_SIZE_DESKTOP)],
      [HOME_SIZE_MOBILE_KEY, String(DEFAULT_HOME_SIZE_MOBILE)],
      [HOME_OFFSET_X_DESKTOP_KEY, String(DEFAULT_HOME_OFFSET)],
      [HOME_OFFSET_X_MOBILE_KEY, String(DEFAULT_HOME_OFFSET)],
      [HOME_OFFSET_Y_DESKTOP_KEY, String(DEFAULT_HOME_OFFSET)],
      [HOME_OFFSET_Y_MOBILE_KEY, String(DEFAULT_HOME_OFFSET)],
      [HOME_LAYER_DESKTOP_KEY, DEFAULT_HOME_LAYER],
      [HOME_LAYER_MOBILE_KEY, DEFAULT_HOME_LAYER],
    ];
    for (const [key, value] of homeSeeds) {
      if ((await getSiteContent(key)) === null) {
        await upsertSiteContent(key, value);
      }
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
    const parsed = patchBodySchema.parse(json);

    if (parsed.target === "background") {
      const { enabled, opacity, sizeDesktop, sizeMobile, offsetYDesktop, offsetYMobile } = parsed;
      if (enabled !== undefined) {
        await upsertSiteContent(BACKGROUND_ENABLED_KEY, enabled ? "true" : "false");
      }
      if (opacity !== undefined) {
        await upsertSiteContent(BACKGROUND_OPACITY_KEY, String(opacity));
      }
      if (sizeDesktop !== undefined) {
        await upsertSiteContent(BACKGROUND_SIZE_DESKTOP_KEY, String(sizeDesktop));
      }
      if (sizeMobile !== undefined) {
        await upsertSiteContent(BACKGROUND_SIZE_MOBILE_KEY, String(sizeMobile));
      }
      if (offsetYDesktop !== undefined) {
        await upsertSiteContent(BACKGROUND_OFFSET_Y_DESKTOP_KEY, String(offsetYDesktop));
      }
      if (offsetYMobile !== undefined) {
        await upsertSiteContent(BACKGROUND_OFFSET_Y_MOBILE_KEY, String(offsetYMobile));
      }
      return NextResponse.json(parsed);
    }

    const {
      enabled,
      sizeDesktop,
      sizeMobile,
      offsetXDesktop,
      offsetXMobile,
      offsetYDesktop,
      offsetYMobile,
      layerDesktop,
      layerMobile,
    } = parsed;
    if (enabled !== undefined) {
      await upsertSiteContent(HOME_ENABLED_KEY, enabled ? "true" : "false");
    }
    if (sizeDesktop !== undefined) {
      await upsertSiteContent(HOME_SIZE_DESKTOP_KEY, String(sizeDesktop));
    }
    if (sizeMobile !== undefined) {
      await upsertSiteContent(HOME_SIZE_MOBILE_KEY, String(sizeMobile));
    }
    if (offsetXDesktop !== undefined) {
      await upsertSiteContent(HOME_OFFSET_X_DESKTOP_KEY, String(offsetXDesktop));
    }
    if (offsetXMobile !== undefined) {
      await upsertSiteContent(HOME_OFFSET_X_MOBILE_KEY, String(offsetXMobile));
    }
    if (offsetYDesktop !== undefined) {
      await upsertSiteContent(HOME_OFFSET_Y_DESKTOP_KEY, String(offsetYDesktop));
    }
    if (offsetYMobile !== undefined) {
      await upsertSiteContent(HOME_OFFSET_Y_MOBILE_KEY, String(offsetYMobile));
    }
    if (layerDesktop !== undefined) {
      await upsertSiteContent(HOME_LAYER_DESKTOP_KEY, layerDesktop);
    }
    if (layerMobile !== undefined) {
      await upsertSiteContent(HOME_LAYER_MOBILE_KEY, layerMobile);
    }
    return NextResponse.json(parsed);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update logo" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { searchParams } = new URL(request.url);
  const targetParam = searchParams.get("target");
  const target = targetParam === "background" ? "background" : targetParam === "home" ? "home" : "header";
  const urlKey = target === "header" ? HEADER_URL_KEY : target === "background" ? BACKGROUND_URL_KEY : HOME_URL_KEY;

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
    } else if (target === "background") {
      await deleteSiteContent(BACKGROUND_URL_KEY);
      await deleteSiteContent(BACKGROUND_ENABLED_KEY);
      await deleteSiteContent(BACKGROUND_OPACITY_KEY);
      await deleteSiteContent(BACKGROUND_SIZE_DESKTOP_KEY);
      await deleteSiteContent(BACKGROUND_SIZE_MOBILE_KEY);
      await deleteSiteContent(BACKGROUND_OFFSET_Y_DESKTOP_KEY);
      await deleteSiteContent(BACKGROUND_OFFSET_Y_MOBILE_KEY);
    } else {
      await deleteSiteContent(HOME_URL_KEY);
      await deleteSiteContent(HOME_ENABLED_KEY);
      await deleteSiteContent(HOME_SIZE_DESKTOP_KEY);
      await deleteSiteContent(HOME_SIZE_MOBILE_KEY);
      await deleteSiteContent(HOME_OFFSET_X_DESKTOP_KEY);
      await deleteSiteContent(HOME_OFFSET_X_MOBILE_KEY);
      await deleteSiteContent(HOME_OFFSET_Y_DESKTOP_KEY);
      await deleteSiteContent(HOME_OFFSET_Y_MOBILE_KEY);
      await deleteSiteContent(HOME_LAYER_DESKTOP_KEY);
      await deleteSiteContent(HOME_LAYER_MOBILE_KEY);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove site logo" }, { status: 500 });
  }
}
