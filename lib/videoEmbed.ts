/**
 * Video link parsing for program videos: YouTube, Vimeo, Facebook, Instagram,
 * TikTok.
 *
 * Program videos are hosted on these platforms and rendered as embeds --
 * user-pasted links are canonicalized server-side to a known-safe embed URL
 * (never trust an arbitrary URL as an iframe src: every embedUrl below is
 * built from a template using only the extracted ID/host, never by
 * concatenating the raw input). Vercel Blob-hosted video files predate this
 * and remain playable via <video>, but new videos are embed-only: Blob
 * egress on the Hobby plan is what suspended the store in July 2026 and
 * broke every blob URL on the site.
 */

export type Provider = "youtube" | "vimeo" | "facebook" | "instagram" | "tiktok";

export type VideoEmbed = {
  provider: Provider;
  /** Safe to use directly as an iframe src. */
  embedUrl: string;
  /** Canonical link-out ("Watch on X") -- also rebuilt from extracted parts, never the raw input. */
  watchUrl: string;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function parseYouTube(url: URL): VideoEmbed | null {
  let id: string | null = null;
  if (url.hostname.replace(/^(www|m)\./, "") === "youtu.be") {
    id = url.pathname.split("/")[1] || null;
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else {
    id = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ?? null;
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  // rel=0 limits end-screen suggestions to the same channel; the nocookie
  // domain avoids tracking cookies for visitors who never hit play.
  return {
    provider: "youtube",
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}

function parseVimeo(url: URL): VideoEmbed | null {
  const host = url.hostname.replace(/^(www|m)\./, "");
  let id: string | null = null;
  let hash: string | null = null;
  // Vimeo unlisted links carry a privacy hash (vimeo.com/<id>/<hash> or
  // ?h=<hash>) that must be preserved or the embed 404s.
  if (host === "player.vimeo.com") {
    id = url.pathname.match(/^\/video\/(\d+)/)?.[1] ?? null;
    hash = url.searchParams.get("h");
  } else {
    const m = url.pathname.match(/^\/(\d+)(?:\/([A-Za-z0-9]+))?/);
    id = m?.[1] ?? null;
    hash = m?.[2] ?? url.searchParams.get("h");
  }
  if (!id) return null;
  const hashQuery = hash ? `?h=${hash}` : "";
  return {
    provider: "vimeo",
    embedUrl: `https://player.vimeo.com/video/${id}${hashQuery}`,
    watchUrl: `https://vimeo.com/${id}${hash ? `/${hash}` : ""}`,
  };
}

function parseFacebook(url: URL): VideoEmbed | null {
  const host = url.hostname.replace(/^(www|m)\./, "");
  if (host !== "facebook.com") return null;

  // facebook.com/<page>/videos/<digits>, facebook.com/reel/<digits>,
  // facebook.com/watch/?v=<digits> -- page/segment names are validated so
  // nothing but a plausible FB path segment ever reaches the rebuilt URL.
  const PAGE = "[A-Za-z0-9._-]+";
  let watchUrl: string | null = null;

  let m = url.pathname.match(new RegExp(`^/(${PAGE})/videos/(\\d+)`));
  if (m) {
    watchUrl = `https://www.facebook.com/${m[1]}/videos/${m[2]}/`;
  } else if ((m = url.pathname.match(/^\/reel\/(\d+)/))) {
    watchUrl = `https://www.facebook.com/reel/${m[1]}/`;
  } else if (url.pathname === "/watch" || url.pathname === "/watch/") {
    const v = url.searchParams.get("v");
    if (v && /^\d+$/.test(v)) watchUrl = `https://www.facebook.com/watch/?v=${v}`;
  }
  if (!watchUrl) return null;

  return {
    provider: "facebook",
    embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(watchUrl)}&show_text=false`,
    watchUrl,
  };
}

function parseInstagram(url: URL): VideoEmbed | null {
  const host = url.hostname.replace(/^(www|m)\./, "");
  if (host !== "instagram.com") return null;

  const m = url.pathname.match(/^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const [, kind, code] = m;
  // Instagram's own embed.js only ever serves through /p/ or /reel/ -- treat
  // /reels/<code> (the feed URL shape) the same as /reel/<code>.
  const embedKind = kind === "p" ? "p" : "reel";
  const watchUrl = `https://www.instagram.com/${embedKind}/${code}/`;

  return {
    provider: "instagram",
    embedUrl: `https://www.instagram.com/${embedKind}/${code}/embed/captioned/`,
    watchUrl,
  };
}

function parseTikTok(url: URL): VideoEmbed | null {
  const host = url.hostname.replace(/^(www|m)\./, "");
  if (host !== "tiktok.com") return null;

  const m = url.pathname.match(/^\/@([A-Za-z0-9._-]+)\/video\/(\d+)/);
  if (!m) return null;
  const [, user, id] = m;

  return {
    provider: "tiktok",
    embedUrl: `https://www.tiktok.com/player/v1/${id}`,
    watchUrl: `https://www.tiktok.com/@${user}/video/${id}`,
  };
}

/**
 * Hosts that only ever appear as short/redirect links -- the video ID isn't
 * present in the URL itself, so these can't be parsed directly and must be
 * resolved (server-side only, see resolveShortVideoLink) before parsing.
 */
const SHORT_LINK_HOSTS = new Set(["fb.watch", "vm.tiktok.com"]);

function isShortLinkHost(url: URL): boolean {
  const host = url.hostname.replace(/^(www|m)\./, "");
  if (SHORT_LINK_HOSTS.has(host)) return true;
  if (host === "tiktok.com" && /^\/t\/[A-Za-z0-9]+/.test(url.pathname)) return true;
  return false;
}

/**
 * Accepts the common watch/share/embed link shapes for YouTube, Vimeo,
 * Facebook, Instagram, and TikTok, and returns the canonical embed + watch
 * URLs, or null for anything else (including short links -- see
 * resolveShortVideoLink for those).
 */
export function parseVideoLink(input: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.replace(/^(www|m)\./, "");

  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
    return parseYouTube(url);
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    return parseVimeo(url);
  }
  if (host === "facebook.com") {
    return parseFacebook(url);
  }
  if (host === "instagram.com") {
    return parseInstagram(url);
  }
  if (host === "tiktok.com") {
    return parseTikTok(url);
  }

  return null;
}

/**
 * Server-only: resolves fb.watch / vm.tiktok.com / tiktok.com/t/<code> short
 * links by following their redirect, then re-parses the destination through
 * parseVideoLink. Not for client use (fetch of an arbitrary host). The
 * allowlist of hosts we'll even attempt to fetch (isShortLinkHost) is fixed
 * and small, and we never follow more than one hop or read the response
 * body -- no SSRF surface beyond "make one request to a known short-link
 * domain and read its Location header".
 */
export async function resolveShortVideoLink(input: string): Promise<VideoEmbed | null> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!isShortLinkHost(url)) return null;

  let resolved: string | null = null;
  try {
    const res = await fetch(url.toString(), { method: "GET", redirect: "manual" });
    const location = res.headers.get("location");
    if (location) {
      resolved = new URL(location, url).toString();
    }
  } catch {
    return null;
  }
  if (!resolved) return null;
  return parseVideoLink(resolved);
}

const EMBED_HOST_MATCHERS: Array<{ provider: Provider; test: (url: URL) => boolean }> = [
  { provider: "youtube", test: (u) => u.hostname === "www.youtube-nocookie.com" },
  { provider: "vimeo", test: (u) => u.hostname === "player.vimeo.com" },
  {
    provider: "facebook",
    test: (u) => u.hostname === "www.facebook.com" && u.pathname === "/plugins/video.php",
  },
  {
    provider: "instagram",
    test: (u) => u.hostname === "www.instagram.com" && /\/embed\/captioned\/?$/.test(u.pathname),
  },
  { provider: "tiktok", test: (u) => u.hostname === "www.tiktok.com" && u.pathname.startsWith("/player/v1/") },
];

/** Returns the provider for a URL produced by parseVideoLink, or null. */
export function platformForStoredUrl(url: string): Provider | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return EMBED_HOST_MATCHERS.find((m) => m.test(parsed))?.provider ?? null;
}

/** True for URLs produced by parseVideoLink -- used to branch iframe vs <video> at render. */
export function isEmbedUrl(url: string): boolean {
  return platformForStoredUrl(url) !== null;
}

/**
 * Derives the "Watch on [Platform]" link-out from a stored embed URL.
 * Used both for the render-side fallback UI and legacy rows.
 */
export function watchUrlForStoredUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname === "www.youtube-nocookie.com") {
    const id = parsed.pathname.match(/^\/embed\/([^/?]+)/)?.[1];
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  }
  if (parsed.hostname === "player.vimeo.com") {
    const id = parsed.pathname.match(/^\/video\/(\d+)/)?.[1];
    const hash = parsed.searchParams.get("h");
    return id ? `https://vimeo.com/${id}${hash ? `/${hash}` : ""}` : null;
  }
  if (parsed.hostname === "www.facebook.com" && parsed.pathname === "/plugins/video.php") {
    const href = parsed.searchParams.get("href");
    return href || null;
  }
  if (parsed.hostname === "www.instagram.com") {
    const m = parsed.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]+)/);
    return m ? `https://www.instagram.com/${m[1]}/${m[2]}/` : null;
  }
  if (parsed.hostname === "www.tiktok.com" && parsed.pathname.startsWith("/player/v1/")) {
    // The player URL only has the numeric ID, not the @user -- TikTok
    // resolves the placeholder handle "@i" to the correct video by ID.
    const id = parsed.pathname.match(/^\/player\/v1\/(\d+)/)?.[1];
    return id ? `https://www.tiktok.com/@i/video/${id}` : null;
  }

  return null;
}
