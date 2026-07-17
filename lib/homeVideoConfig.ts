/**
 * Split out from lib/homeVideo.ts because that file also exports functions
 * that import lib/siteContent.ts (which pulls in lib/prisma.ts, and
 * therefore `pg` -- fine for server components/routes, but
 * HomeVideoForm.tsx and HomeVideoHero.tsx are "use client" components that
 * only need these types/schema/parsers, and bundling `pg` into the client
 * build fails (it needs Node built-ins like `tls`). Same split as
 * lib/missionBlocks.ts vs lib/mission.ts.
 */
import { z } from "zod";
import { platformForStoredUrl } from "@/lib/videoEmbed";

export const HOME_VIDEO_PROVIDERS = ["youtube", "vimeo"] as const;
export type HomeVideoProvider = (typeof HOME_VIDEO_PROVIDERS)[number];

/** An https:// URL or a site-relative path (e.g. /brand/poster.png) -- for
 *  poster overrides and CTA links, which may point at a committed static
 *  asset rather than an external host. */
const httpsOrRelative = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith("/") || /^https:\/\//.test(v), {
    message: "Must be an https:// URL or a site-relative path starting with /",
  });

export const homeVideoConfigSchema = z
  .object({
    provider: z.enum(HOME_VIDEO_PROVIDERS),
    /** Canonical embed URL from parseVideoLink -- safe to use as an iframe src. */
    embedUrl: z.string().url(),
    /** Canonical "watch on X" link-out, also from parseVideoLink. */
    watchUrl: z.string().url(),
    /** Auto-derived thumbnail, resolved server-side at save time. */
    derivedPosterUrl: z.string().url().nullable(),
    /** Admin-supplied poster, wins over derivedPosterUrl when set. */
    posterOverrideUrl: httpsOrRelative.nullable(),
    heading: z.string().trim().min(1).max(120).nullable(),
    description: z.string().trim().min(1).max(500).nullable(),
    ctaLabel: z.string().trim().min(1).max(60).nullable(),
    ctaHref: httpsOrRelative.nullable(),
  })
  .refine((c) => (c.ctaLabel === null) === (c.ctaHref === null), {
    message: "CTA label and link must be provided together",
    path: ["ctaLabel"],
  });

export type HomeVideoConfig = z.infer<typeof homeVideoConfigSchema>;

/** Admin override wins; otherwise the auto-derived thumbnail; otherwise null. */
export function effectivePosterUrl(config: HomeVideoConfig): string | null {
  return config.posterOverrideUrl ?? config.derivedPosterUrl ?? null;
}

const YOUTUBE_EMBED_ID = /^\/embed\/([A-Za-z0-9_-]{11})/;

/** "https://www.youtube-nocookie.com/embed/<id>?rel=0" -> the standard YouTube thumbnail URL, or null. */
export function youtubePosterFromEmbedUrl(embedUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(embedUrl);
  } catch {
    return null;
  }
  if (parsed.hostname !== "www.youtube-nocookie.com") return null;
  const id = parsed.pathname.match(YOUTUBE_EMBED_ID)?.[1];
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

/**
 * Parses the stored `homeVideo` JSON; malformed/missing data degrades to
 * null. Defense in depth: re-checks that embedUrl's actual platform matches
 * the stored provider, so a hand-edited DB row can never put an arbitrary
 * URL into the homepage iframe.
 */
export function parseHomeVideoConfig(raw: string | null): HomeVideoConfig | null {
  if (!raw) return null;
  try {
    const config = homeVideoConfigSchema.parse(JSON.parse(raw));
    if (platformForStoredUrl(config.embedUrl) !== config.provider) return null;
    return config;
  } catch {
    return null;
  }
}
