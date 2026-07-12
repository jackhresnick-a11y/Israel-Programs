/**
 * YouTube/Vimeo link parsing for program videos.
 *
 * Program videos are hosted on YouTube or Vimeo and rendered as embeds —
 * user-pasted links are canonicalized server-side to a known-safe embed URL
 * (never trust an arbitrary URL as an iframe src). Vercel Blob-hosted video
 * files predate this and remain playable via <video>, but new videos are
 * embed-only: Blob egress on the Hobby plan is what suspended the store in
 * July 2026 and broke every blob URL on the site.
 */

export type VideoEmbed = { provider: "youtube" | "vimeo"; embedUrl: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Accepts the common watch/share/embed link shapes for both providers and
 * returns the canonical embed URL, or null for anything else. Vimeo unlisted
 * links carry a privacy hash (vimeo.com/<id>/<hash> or ?h=<hash>) that must
 * be preserved or the embed 404s.
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
    let id: string | null = null;
    if (host === "youtu.be") {
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
    };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    let id: string | null = null;
    let hash: string | null = null;
    if (host === "player.vimeo.com") {
      id = url.pathname.match(/^\/video\/(\d+)/)?.[1] ?? null;
      hash = url.searchParams.get("h");
    } else {
      const m = url.pathname.match(/^\/(\d+)(?:\/([A-Za-z0-9]+))?/);
      id = m?.[1] ?? null;
      hash = m?.[2] ?? url.searchParams.get("h");
    }
    if (!id) return null;
    return {
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`,
    };
  }

  return null;
}

const EMBED_HOSTS = new Set(["www.youtube-nocookie.com", "player.vimeo.com"]);

/** True for URLs produced by parseVideoLink — used to branch iframe vs <video> at render. */
export function isEmbedUrl(url: string): boolean {
  try {
    return EMBED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
