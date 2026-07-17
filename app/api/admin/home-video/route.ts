import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { parseVideoLink } from "@/lib/videoEmbed";
import { homeVideoConfigSchema, youtubePosterFromEmbedUrl, type HomeVideoConfig } from "@/lib/homeVideoConfig";
import { fetchVimeoPosterUrl, saveHomeVideoConfig, setHomeVideoEnabled } from "@/lib/homeVideo";

const httpsOrRelative = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith("/") || /^https:\/\//.test(v), {
    message: "Must be an https:// URL or a site-relative path starting with /",
  });

const configInputSchema = z.object({
  videoUrl: z.string().trim().min(1).max(1000),
  posterOverrideUrl: httpsOrRelative.nullable(),
  heading: z.string().trim().max(120).nullable(),
  description: z.string().trim().max(500).nullable(),
  ctaLabel: z.string().trim().max(60).nullable(),
  ctaHref: httpsOrRelative.nullable(),
});

const patchBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    config: configInputSchema.optional(),
  })
  .refine((b) => b.enabled !== undefined || b.config !== undefined, "No changes provided");

/** Admin-only: manages the homepage hero video -- a site-wide SiteContent
 *  setting, not per-program. `enabled` and `config` are independent PATCHes
 *  (see lib/homeVideo.ts) so toggling the section on/off never touches the
 *  saved video config, and editing the config never flips the toggle. */
export async function PATCH(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { enabled, config: input } = patchBodySchema.parse(await request.json());

    let storedConfig: HomeVideoConfig | undefined;
    if (input) {
      const embed = parseVideoLink(input.videoUrl);
      if (!embed || (embed.provider !== "youtube" && embed.provider !== "vimeo")) {
        return NextResponse.json(
          { error: "Only YouTube and Vimeo links are supported" },
          { status: 400 }
        );
      }

      const derivedPosterUrl =
        embed.provider === "youtube"
          ? youtubePosterFromEmbedUrl(embed.embedUrl)
          : await fetchVimeoPosterUrl(embed.watchUrl);

      storedConfig = homeVideoConfigSchema.parse({
        provider: embed.provider,
        embedUrl: embed.embedUrl,
        watchUrl: embed.watchUrl,
        derivedPosterUrl,
        posterOverrideUrl: input.posterOverrideUrl || null,
        heading: input.heading || null,
        description: input.description || null,
        ctaLabel: input.ctaLabel || null,
        ctaHref: input.ctaHref || null,
      });
      await saveHomeVideoConfig(storedConfig);
    }

    if (enabled !== undefined) {
      await setHomeVideoEnabled(enabled);
    }

    return NextResponse.json({ enabled, config: storedConfig });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update homepage video settings" }, { status: 500 });
  }
}
