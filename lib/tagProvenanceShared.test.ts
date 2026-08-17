import { describe, it, expect } from "vitest";
import { resolveSource, tagProvenanceInputSchema, countUnprovenancedTags } from "./tagProvenanceShared";

describe("resolveSource", () => {
  it("resolves a missing row to UNKNOWN -- absence of a row IS the UNKNOWN state", () => {
    expect(resolveSource(null)).toBe("UNKNOWN");
    expect(resolveSource(undefined)).toBe("UNKNOWN");
  });

  it("resolves an explicit UNKNOWN row identically to a missing row", () => {
    expect(resolveSource({ source: "UNKNOWN" })).toBe("UNKNOWN");
  });

  it("resolves a real source through unchanged", () => {
    expect(resolveSource({ source: "OFFICIAL_SITE" })).toBe("OFFICIAL_SITE");
    expect(resolveSource({ source: "POLL_DERIVED" })).toBe("POLL_DERIVED");
    expect(resolveSource({ source: "ADMIN_ASSERTED" })).toBe("ADMIN_ASSERTED");
    expect(resolveSource({ source: "INFERRED" })).toBe("INFERRED");
  });
});

describe("tagProvenanceInputSchema", () => {
  it("accepts a minimal valid payload (source only)", () => {
    const result = tagProvenanceInputSchema.parse({ tagId: "tag_1", source: "OFFICIAL_SITE" });
    expect(result).toEqual({ tagId: "tag_1", source: "OFFICIAL_SITE" });
  });

  it("accepts a full payload with sourceUrl and note", () => {
    const result = tagProvenanceInputSchema.parse({
      tagId: "tag_1",
      source: "ADMIN_ASSERTED",
      sourceUrl: "https://example.com/about",
      note: "confirmed by phone",
    });
    expect(result.sourceUrl).toBe("https://example.com/about");
    expect(result.note).toBe("confirmed by phone");
  });

  it("accepts a blank sourceUrl/note (the UI's 'not set' state)", () => {
    const result = tagProvenanceInputSchema.parse({
      tagId: "tag_1",
      source: "UNKNOWN",
      sourceUrl: "",
      note: "",
    });
    expect(result.sourceUrl).toBe("");
    expect(result.note).toBe("");
  });

  it("rejects a non-http(s) sourceUrl (e.g. javascript:) -- same discipline as lib/programs.ts's httpUrl", () => {
    expect(() =>
      tagProvenanceInputSchema.parse({ tagId: "tag_1", source: "OFFICIAL_SITE", sourceUrl: "javascript:alert(1)" })
    ).toThrow();
  });

  it("rejects an unknown source enum value", () => {
    expect(() => tagProvenanceInputSchema.parse({ tagId: "tag_1", source: "MADE_UP" })).toThrow();
  });

  it("rejects a missing tagId", () => {
    expect(() => tagProvenanceInputSchema.parse({ source: "OFFICIAL_SITE" })).toThrow();
  });
});

describe("countUnprovenancedTags", () => {
  it("counts every tag as unprovenanced when nothing has a provenance row", () => {
    expect(countUnprovenancedTags(["t1", "t2", "t3"], new Set())).toBe(3);
  });

  it("drops the count as provenance rows land", () => {
    expect(countUnprovenancedTags(["t1", "t2", "t3"], new Set(["t1"]))).toBe(2);
    expect(countUnprovenancedTags(["t1", "t2", "t3"], new Set(["t1", "t2", "t3"]))).toBe(0);
  });

  it("accepts a plain array as well as a Set for the provenanced ids", () => {
    expect(countUnprovenancedTags(["t1", "t2"], ["t1"])).toBe(1);
  });

  it("returns 0 for a program with no tags", () => {
    expect(countUnprovenancedTags([], new Set())).toBe(0);
  });
});
