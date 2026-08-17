import { describe, it, expect } from "vitest";
import {
  LOCATION_FACETS,
  TYPE_FACETS,
  MIN_PROGRAMS_PER_PAGE,
  meetsThreshold,
  findLocationFacet,
  findTypeFacet,
  filterTagsFor,
  canonicalPathFor,
  defaultCopyFor,
  locationPagesCopySchema,
} from "./locationPagesContent";

describe("meetsThreshold", () => {
  it("is false just below MIN_PROGRAMS_PER_PAGE", () => {
    expect(meetsThreshold(MIN_PROGRAMS_PER_PAGE - 1)).toBe(false);
  });

  it("is true exactly at MIN_PROGRAMS_PER_PAGE", () => {
    expect(meetsThreshold(MIN_PROGRAMS_PER_PAGE)).toBe(true);
  });

  it("is true above MIN_PROGRAMS_PER_PAGE", () => {
    expect(meetsThreshold(MIN_PROGRAMS_PER_PAGE + 100)).toBe(true);
  });

  it("is false for zero", () => {
    expect(meetsThreshold(0)).toBe(false);
  });
});

describe("LOCATION_FACETS", () => {
  it("has unique slugs", () => {
    const slugs = LOCATION_FACETS.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("folds ramat-hasharon into coastal-israel's tag set rather than giving it its own facet", () => {
    expect(LOCATION_FACETS.some((f) => f.slug === "ramat-hasharon")).toBe(false);
    const coastal = findLocationFacet("coastal-israel");
    expect(coastal?.tagSlugs).toEqual(expect.arrayContaining(["coastal-israel", "ramat-hasharon"]));
  });

  it("every other facet's tagSlugs is just its own slug (no other folds)", () => {
    for (const facet of LOCATION_FACETS) {
      if (facet.slug === "coastal-israel") continue;
      expect(facet.tagSlugs).toEqual([facet.slug]);
    }
  });
});

describe("TYPE_FACETS", () => {
  it("has unique slugs", () => {
    const slugs = TYPE_FACETS.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("filterTagsFor", () => {
  it("returns null for an unknown location slug", () => {
    expect(filterTagsFor(null, "not-a-real-location")).toBeNull();
  });

  it("returns null for an unknown type slug", () => {
    expect(filterTagsFor("not-a-real-type", "jerusalem")).toBeNull();
  });

  it("location-only lookup returns exactly that facet's tagSlugs", () => {
    expect(filterTagsFor(null, "jerusalem")).toEqual(["jerusalem"]);
  });

  it("type + location concatenates both facets' tagSlugs, folded location included", () => {
    const tags = filterTagsFor("israeli-yeshiva", "coastal-israel");
    expect(tags).toEqual(expect.arrayContaining(["coastal-israel", "ramat-hasharon", "israeli-yeshiva"]));
    expect(tags).toHaveLength(3);
  });

  it("round-trips: every combination it accepts produces a set canonicalPathFor can address", () => {
    for (const location of LOCATION_FACETS) {
      const locationOnly = filterTagsFor(null, location.slug);
      expect(locationOnly).not.toBeNull();
      expect(canonicalPathFor(null, location.slug)).toBe(`/programs/location/${location.slug}`);
      for (const type of TYPE_FACETS) {
        const both = filterTagsFor(type.slug, location.slug);
        expect(both).not.toBeNull();
        expect(canonicalPathFor(type.slug, location.slug)).toBe(
          `/programs/type/${type.slug}/location/${location.slug}`
        );
      }
    }
  });
});

describe("findLocationFacet / findTypeFacet", () => {
  it("finds a known slug", () => {
    expect(findLocationFacet("jerusalem")?.label).toBe("Jerusalem");
    expect(findTypeFacet("israeli-yeshiva")?.label).toBeTruthy();
  });

  it("returns undefined for an unknown slug", () => {
    expect(findLocationFacet("nowhere")).toBeUndefined();
    expect(findTypeFacet("not-a-type")).toBeUndefined();
  });
});

describe("defaultCopyFor", () => {
  it("produces a non-empty placeholder intro for a location-only page", () => {
    const copy = defaultCopyFor(null, "jerusalem");
    expect(copy.intro.length).toBeGreaterThan(0);
    expect(copy.intro).toContain("Jerusalem");
  });

  it("produces a non-empty placeholder intro for a type + location page", () => {
    const copy = defaultCopyFor("israeli-yeshiva", "jerusalem");
    expect(copy.intro.length).toBeGreaterThan(0);
  });

  it("every default copy entry parses against the shared schema", () => {
    for (const location of LOCATION_FACETS) {
      expect(() => locationPagesCopySchema.parse({ [canonicalPathFor(null, location.slug)]: defaultCopyFor(null, location.slug) })).not.toThrow();
      for (const type of TYPE_FACETS) {
        const path = canonicalPathFor(type.slug, location.slug);
        expect(() =>
          locationPagesCopySchema.parse({ [path]: defaultCopyFor(type.slug, location.slug) })
        ).not.toThrow();
      }
    }
  });
});

describe("locationPagesCopySchema", () => {
  it("accepts a partial override map with one path", () => {
    expect(() =>
      locationPagesCopySchema.parse({ "/programs/location/jerusalem": { intro: "Custom copy." } })
    ).not.toThrow();
  });

  it("rejects an empty intro", () => {
    expect(() => locationPagesCopySchema.parse({ "/programs/location/jerusalem": { intro: "" } })).toThrow();
  });
});
