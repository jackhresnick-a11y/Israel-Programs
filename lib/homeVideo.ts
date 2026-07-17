import { getSiteContent, upsertSiteContent } from "@/lib/siteContent";
import { parseHomeVideoConfig, type HomeVideoConfig } from "@/lib/homeVideoConfig";

export {
  HOME_VIDEO_PROVIDERS,
  homeVideoConfigSchema,
  parseHomeVideoConfig,
  effectivePosterUrl,
  youtubePosterFromEmbedUrl,
  type HomeVideoProvider,
  type HomeVideoConfig,
} from "@/lib/homeVideoConfig";

const ENABLED_KEY = "homeVideoEnabled";
const CONFIG_KEY = "homeVideo";

export type HomeVideoSettings = { enabled: boolean; config: HomeVideoConfig | null };

export async function getHomeVideoSettings(): Promise<HomeVideoSettings> {
  const [enabled, raw] = await Promise.all([
    getSiteContent(ENABLED_KEY),
    getSiteContent(CONFIG_KEY),
  ]);
  return { enabled: enabled === "true", config: parseHomeVideoConfig(raw) };
}

/** Upserts only the toggle -- never touches the saved config, so hiding the
 *  section never loses it. */
export async function setHomeVideoEnabled(enabled: boolean) {
  await upsertSiteContent(ENABLED_KEY, enabled ? "true" : "false");
}

/** Upserts only the config -- never touches the toggle, so editing while
 *  hidden doesn't turn the section on. */
export async function saveHomeVideoConfig(config: HomeVideoConfig) {
  await upsertSiteContent(CONFIG_KEY, JSON.stringify(config));
}

const VIMEO_OEMBED_TIMEOUT_MS = 5000;

/**
 * Server-only: resolves the Vimeo thumbnail via oEmbed at save time. Any
 * failure (network, timeout, non-200, bad JSON, thumbnail off the expected
 * CDN host) resolves to null -- a missing poster never blocks a save; the
 * hero facade degrades to its no-image state. watchUrl is always a
 * canonical URL rebuilt by parseVideoLink from an extracted numeric ID
 * (never the raw admin input), so this is a fixed-shape fetch, same
 * posture as lib/videoEmbed.ts's resolveShortVideoLink.
 */
export async function fetchVimeoPosterUrl(watchUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(watchUrl)}`, {
      signal: AbortSignal.timeout(VIMEO_OEMBED_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const thumbnail = typeof body?.thumbnail_url === "string" ? body.thumbnail_url : null;
    if (!thumbnail) return null;

    const parsed = new URL(thumbnail);
    if (parsed.protocol !== "https:" || parsed.hostname !== "i.vimeocdn.com") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
