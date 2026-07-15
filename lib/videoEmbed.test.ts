import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseVideoLink,
  resolveShortVideoLink,
  isEmbedUrl,
  platformForStoredUrl,
  watchUrlForStoredUrl,
} from "./videoEmbed";

describe("parseVideoLink: youtube", () => {
  it("accepts watch, youtu.be, shorts, embed, live shapes", () => {
    const cases = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    ];
    for (const url of cases) {
      const r = parseVideoLink(url);
      expect(r).not.toBeNull();
      expect(r?.provider).toBe("youtube");
      expect(r?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
      expect(r?.watchUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    }
  });

  it("rejects malformed video IDs", () => {
    expect(parseVideoLink("https://youtu.be/short")).toBeNull();
    expect(parseVideoLink("https://www.youtube.com/watch?v=")).toBeNull();
  });
});

describe("parseVideoLink: vimeo", () => {
  it("accepts plain and player links, preserving the privacy hash", () => {
    const plain = parseVideoLink("https://vimeo.com/76979871");
    expect(plain?.provider).toBe("vimeo");
    expect(plain?.embedUrl).toBe("https://player.vimeo.com/video/76979871");
    expect(plain?.watchUrl).toBe("https://vimeo.com/76979871");

    const unlistedPath = parseVideoLink("https://vimeo.com/76979871/abcdef1234");
    expect(unlistedPath?.embedUrl).toBe("https://player.vimeo.com/video/76979871?h=abcdef1234");
    expect(unlistedPath?.watchUrl).toBe("https://vimeo.com/76979871/abcdef1234");

    const unlistedQuery = parseVideoLink("https://vimeo.com/76979871?h=abcdef1234");
    expect(unlistedQuery?.embedUrl).toBe("https://player.vimeo.com/video/76979871?h=abcdef1234");

    const playerUrl = parseVideoLink("https://player.vimeo.com/video/76979871?h=abcdef1234");
    expect(playerUrl?.embedUrl).toBe("https://player.vimeo.com/video/76979871?h=abcdef1234");
  });
});

describe("parseVideoLink: facebook", () => {
  it("accepts page/videos, /reel/, and /watch/?v= shapes", () => {
    const page = parseVideoLink("https://www.facebook.com/someorg/videos/1234567890/");
    expect(page?.provider).toBe("facebook");
    expect(page?.watchUrl).toBe("https://www.facebook.com/someorg/videos/1234567890/");
    expect(page?.embedUrl).toBe(
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(page!.watchUrl)}&show_text=false`
    );

    const reel = parseVideoLink("https://www.facebook.com/reel/9876543210");
    expect(reel?.watchUrl).toBe("https://www.facebook.com/reel/9876543210/");

    const watch = parseVideoLink("https://www.facebook.com/watch/?v=1122334455");
    expect(watch?.watchUrl).toBe("https://www.facebook.com/watch/?v=1122334455");
  });

  it("never lets the raw href leak into the embed URL unescaped (rebuilt from extracted ID, not the raw input)", () => {
    const r = parseVideoLink(
      'https://www.facebook.com/someorg/videos/1234567890/?x="><script>alert(1)</script>'
    );
    expect(r?.embedUrl).not.toContain("<script>");
    expect(r?.embedUrl).toBe(
      "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fsomeorg%2Fvideos%2F1234567890%2F&show_text=false"
    );
  });

  it("rejects unrelated facebook paths", () => {
    expect(parseVideoLink("https://www.facebook.com/someorg/photos/1234567890/")).toBeNull();
    expect(parseVideoLink("https://www.facebook.com/watch/?v=notanumber")).toBeNull();
  });
});

describe("parseVideoLink: instagram", () => {
  it("accepts /p/, /reel/, /reels/, /tv/ shapes", () => {
    const reel = parseVideoLink("https://www.instagram.com/reel/CzTWjU5K8Hl/");
    expect(reel?.provider).toBe("instagram");
    expect(reel?.embedUrl).toBe("https://www.instagram.com/reel/CzTWjU5K8Hl/embed/captioned/");
    expect(reel?.watchUrl).toBe("https://www.instagram.com/reel/CzTWjU5K8Hl/");

    const reels = parseVideoLink("https://www.instagram.com/reels/CzTWjU5K8Hl/");
    expect(reels?.embedUrl).toBe("https://www.instagram.com/reel/CzTWjU5K8Hl/embed/captioned/");

    const post = parseVideoLink("https://www.instagram.com/p/CzTWjU5K8Hl/");
    expect(post?.embedUrl).toBe("https://www.instagram.com/p/CzTWjU5K8Hl/embed/captioned/");

    // IGTV (/tv/) posts embed through the same /reel/ embed path -- Instagram
    // merged IGTV into the main feed and no longer serves a /tv/ embed shape.
    const tv = parseVideoLink("https://www.instagram.com/tv/CzTWjU5K8Hl/");
    expect(tv?.embedUrl).toBe("https://www.instagram.com/reel/CzTWjU5K8Hl/embed/captioned/");
  });

  it("rejects profile-only links", () => {
    expect(parseVideoLink("https://www.instagram.com/natgeo/")).toBeNull();
  });
});

describe("parseVideoLink: tiktok", () => {
  it("accepts @user/video/<id>", () => {
    const r = parseVideoLink("https://www.tiktok.com/@scout2015/video/6718335390845095173");
    expect(r?.provider).toBe("tiktok");
    expect(r?.embedUrl).toBe("https://www.tiktok.com/player/v1/6718335390845095173");
    expect(r?.watchUrl).toBe("https://www.tiktok.com/@scout2015/video/6718335390845095173");
  });

  it("rejects short links directly (must go through resolveShortVideoLink)", () => {
    expect(parseVideoLink("https://vm.tiktok.com/ZMabcdefg/")).toBeNull();
    expect(parseVideoLink("https://www.tiktok.com/t/ZMabcdefg/")).toBeNull();
  });
});

describe("parseVideoLink: rejects unsafe and unsupported input", () => {
  it("rejects non-URL and non-http(s) schemes", () => {
    expect(parseVideoLink("not a url")).toBeNull();
    expect(parseVideoLink("javascript:alert(1)")).toBeNull();
    expect(parseVideoLink("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(parseVideoLink("ftp://example.com/video")).toBeNull();
  });

  it("rejects unsupported hosts", () => {
    expect(parseVideoLink("https://www.dailymotion.com/video/x7tgcev")).toBeNull();
    expect(parseVideoLink("https://example.com/")).toBeNull();
  });
});

describe("resolveShortVideoLink", () => {
  afterEach(() => vi.restoreAllMocks());

  it("follows a single redirect hop and re-parses the destination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        headers: new Headers({ location: "https://www.tiktok.com/@scout2015/video/6718335390845095173" }),
      })
    );
    const r = await resolveShortVideoLink("https://vm.tiktok.com/ZMabcdefg/");
    expect(r?.provider).toBe("tiktok");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null for hosts outside the short-link allowlist (no arbitrary fetch)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await resolveShortVideoLink("https://example.com/redirect-me")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null if the redirect has no Location header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ headers: new Headers() }));
    expect(await resolveShortVideoLink("https://fb.watch/abc123/")).toBeNull();
  });
});

describe("platformForStoredUrl / isEmbedUrl / watchUrlForStoredUrl round-trip", () => {
  const samples: Array<[string, string]> = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["https://vimeo.com/76979871", "https://vimeo.com/76979871"],
    [
      "https://www.facebook.com/someorg/videos/1234567890/",
      "https://www.facebook.com/someorg/videos/1234567890/",
    ],
    ["https://www.instagram.com/reel/CzTWjU5K8Hl/", "https://www.instagram.com/reel/CzTWjU5K8Hl/"],
    [
      "https://www.tiktok.com/@scout2015/video/6718335390845095173",
      "https://www.tiktok.com/@i/video/6718335390845095173",
    ],
  ];

  it.each(samples)("round-trips %s", (input, expectedWatch) => {
    const embed = parseVideoLink(input);
    expect(embed).not.toBeNull();
    expect(platformForStoredUrl(embed!.embedUrl)).toBe(embed!.provider);
    expect(isEmbedUrl(embed!.embedUrl)).toBe(true);
    expect(watchUrlForStoredUrl(embed!.embedUrl)).toBe(expectedWatch);
  });

  it("returns null/false for a non-embed URL", () => {
    expect(platformForStoredUrl("https://example.com/foo.mp4")).toBeNull();
    expect(isEmbedUrl("https://example.com/foo.mp4")).toBe(false);
    expect(watchUrlForStoredUrl("https://example.com/foo.mp4")).toBeNull();
  });

  it("returns false/null for a legacy Vercel Blob URL", () => {
    const blobUrl = "https://abc123.public.blob.vercel-storage.com/videos/foo.mp4";
    expect(isEmbedUrl(blobUrl)).toBe(false);
    expect(platformForStoredUrl(blobUrl)).toBeNull();
    expect(watchUrlForStoredUrl(blobUrl)).toBeNull();
  });
});
