import { describe, it, expect } from "vitest";
import {
  homeVideoConfigSchema,
  parseHomeVideoConfig,
  youtubePosterFromEmbedUrl,
  effectivePosterUrl,
  type HomeVideoConfig,
} from "./homeVideoConfig";

const baseConfig: HomeVideoConfig = {
  provider: "youtube",
  embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
  watchUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  derivedPosterUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  posterOverrideUrl: null,
  heading: null,
  description: null,
  ctaLabel: null,
  ctaHref: null,
};

describe("parseHomeVideoConfig", () => {
  it("returns null for missing or empty input", () => {
    expect(parseHomeVideoConfig(null)).toBeNull();
    expect(parseHomeVideoConfig("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseHomeVideoConfig("not json")).toBeNull();
  });

  it("round-trips a valid config", () => {
    const raw = JSON.stringify(baseConfig);
    expect(parseHomeVideoConfig(raw)).toEqual(baseConfig);
  });

  it("returns null when provider doesn't match the embedUrl's actual platform (tampered row)", () => {
    const tampered = { ...baseConfig, provider: "vimeo" };
    expect(parseHomeVideoConfig(JSON.stringify(tampered))).toBeNull();
  });

  it("returns null when embedUrl isn't a recognized embed host at all", () => {
    const tampered = { ...baseConfig, embedUrl: "https://evil.example.com/embed" };
    expect(parseHomeVideoConfig(JSON.stringify(tampered))).toBeNull();
  });

  it("returns null when only one of ctaLabel/ctaHref is set", () => {
    const halfCta = { ...baseConfig, ctaLabel: "Learn more" };
    expect(parseHomeVideoConfig(JSON.stringify(halfCta))).toBeNull();
  });

  it("accepts a config with both ctaLabel and ctaHref, or neither", () => {
    const withCta = { ...baseConfig, ctaLabel: "Learn more", ctaHref: "/programs" };
    expect(parseHomeVideoConfig(JSON.stringify(withCta))).not.toBeNull();
    expect(parseHomeVideoConfig(JSON.stringify(baseConfig))).not.toBeNull();
  });
});

describe("homeVideoConfigSchema", () => {
  it("rejects an unsupported provider value", () => {
    expect(() => homeVideoConfigSchema.parse({ ...baseConfig, provider: "tiktok" })).toThrow();
  });

  it("rejects a posterOverrideUrl that isn't https or site-relative", () => {
    expect(() =>
      homeVideoConfigSchema.parse({ ...baseConfig, posterOverrideUrl: "http://insecure.example.com/x.png" })
    ).toThrow();
  });

  it("accepts a site-relative posterOverrideUrl", () => {
    expect(() =>
      homeVideoConfigSchema.parse({ ...baseConfig, posterOverrideUrl: "/brand/poster.png" })
    ).not.toThrow();
  });
});

describe("youtubePosterFromEmbedUrl", () => {
  it("derives the thumbnail URL from a canonical YouTube embed URL", () => {
    expect(youtubePosterFromEmbedUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0")).toBe(
      "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    );
  });

  it("returns null for a Vimeo embed URL", () => {
    expect(youtubePosterFromEmbedUrl("https://player.vimeo.com/video/76979871")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(youtubePosterFromEmbedUrl("not a url")).toBeNull();
  });
});

describe("effectivePosterUrl", () => {
  it("prefers the override when set", () => {
    const config = { ...baseConfig, posterOverrideUrl: "/brand/override.png" };
    expect(effectivePosterUrl(config)).toBe("/brand/override.png");
  });

  it("falls back to the derived poster", () => {
    expect(effectivePosterUrl(baseConfig)).toBe(baseConfig.derivedPosterUrl);
  });

  it("returns null when neither is set", () => {
    const config = { ...baseConfig, derivedPosterUrl: null };
    expect(effectivePosterUrl(config)).toBeNull();
  });
});
