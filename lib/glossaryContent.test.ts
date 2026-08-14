import { describe, it, expect } from "vitest";
import {
  DEFAULT_GLOSSARY_ENTRIES,
  glossaryEntriesSchema,
  glossaryArticleJsonLd,
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
