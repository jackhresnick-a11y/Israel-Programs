import { describe, it, expect } from "vitest";
import {
  DEFAULT_GLOSSARY_ENTRIES,
  glossaryEntriesSchema,
  glossaryArticleJsonLd,
  isGlossaryEntryPublished,
  type GlossaryEntry,
} from "./glossaryContent";

describe("DEFAULT_GLOSSARY_ENTRIES", () => {
  it("parses against the schema", () => {
    expect(() => glossaryEntriesSchema.parse(DEFAULT_GLOSSARY_ENTRIES)).not.toThrow();
  });

  it("has unique slugs", () => {
    const slugs = DEFAULT_GLOSSARY_ENTRIES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every programLinks href starts with /programs", () => {
    for (const entry of DEFAULT_GLOSSARY_ENTRIES) {
      for (const link of entry.programLinks) {
        expect(link.href.startsWith("/programs")).toBe(true);
      }
    }
  });

  it("every related slug resolves to a real entry", () => {
    const slugs = new Set(DEFAULT_GLOSSARY_ENTRIES.map((e) => e.slug));
    for (const entry of DEFAULT_GLOSSARY_ENTRIES) {
      for (const relatedSlug of entry.related ?? []) {
        expect(slugs.has(relatedSlug)).toBe(true);
      }
    }
  });

  it("has at least one section per entry", () => {
    for (const entry of DEFAULT_GLOSSARY_ENTRIES) {
      expect(entry.sections.length).toBeGreaterThan(0);
    }
  });
});

describe("glossaryEntriesSchema cross-entry validation", () => {
  it("rejects two entries sharing a slug", () => {
    const [first, second, ...rest] = DEFAULT_GLOSSARY_ENTRIES;
    const duplicated = [first, { ...second, slug: first.slug }, ...rest];
    expect(() => glossaryEntriesSchema.parse(duplicated)).toThrow();
  });

  it("rejects a related slug that doesn't match any entry in the array", () => {
    const [first, ...rest] = DEFAULT_GLOSSARY_ENTRIES;
    const broken = [{ ...first, related: ["does-not-exist"] }, ...rest];
    expect(() => glossaryEntriesSchema.parse(broken)).toThrow();
  });

  it("accepts an entry with no programLinks", () => {
    const [first, ...rest] = DEFAULT_GLOSSARY_ENTRIES;
    const noLinks = [{ ...first, programLinks: [] }, ...rest];
    expect(() => glossaryEntriesSchema.parse(noLinks)).not.toThrow();
  });
});

describe("isGlossaryEntryPublished", () => {
  const base: GlossaryEntry = DEFAULT_GLOSSARY_ENTRIES[0];

  it("treats an entry with no `published` field as published", () => {
    expect(isGlossaryEntryPublished(base)).toBe(true);
  });

  it("treats `published: true` as published", () => {
    expect(isGlossaryEntryPublished({ ...base, published: true })).toBe(true);
  });

  it("treats `published: false` as unpublished", () => {
    expect(isGlossaryEntryPublished({ ...base, published: false })).toBe(false);
  });
});

describe("glossaryArticleJsonLd", () => {
  it("builds a schema.org Article with the entry's term, summary, and URL", () => {
    const entry = DEFAULT_GLOSSARY_ENTRIES[0];
    const jsonLd = glossaryArticleJsonLd(entry, "https://example.com", "Example Site");
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Article");
    expect(jsonLd.headline).toBe(entry.term);
    expect(jsonLd.description).toBe(entry.summary);
    expect(jsonLd.url).toBe(`https://example.com/glossary/${entry.slug}`);
    expect(jsonLd.publisher).toEqual({ "@type": "Organization", name: "Example Site" });
  });

  it("omits datePublished/dateModified -- no per-entry date exists in the content model", () => {
    const entry = DEFAULT_GLOSSARY_ENTRIES[0];
    const jsonLd = glossaryArticleJsonLd(entry, "https://example.com", "Example Site");
    expect(jsonLd).not.toHaveProperty("datePublished");
    expect(jsonLd).not.toHaveProperty("dateModified");
  });
});
