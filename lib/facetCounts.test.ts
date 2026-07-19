import { describe, it, expect } from "vitest";
import {
  matchesSelections,
  computeFacetCounts,
  computeRegionCounts,
  dropOneCounts,
  type FacetProgram,
} from "./facetCounts";

// A small fixture mirroring the real taxonomy's shape: gender/affiliation categorized
// tags OR within category, general (uncategorized) tags OR together, location tags
// grouped under a region.
const programs: FacetProgram[] = [
  { id: "1", durationType: "GAP_YEAR", tagSlugs: ["boys-only", "rz-modern-orthodox", "jerusalem"] },
  { id: "2", durationType: "GAP_YEAR", tagSlugs: ["girls-only", "rz-modern-orthodox", "jerusalem"] },
  { id: "3", durationType: "SEMESTER", tagSlugs: ["coed", "flexible-religously", "haifa"] },
  { id: "4", durationType: "SUMMER", tagSlugs: ["coed"] }, // no affiliation, no location
  { id: "5", durationType: "GAP_YEAR", tagSlugs: ["boys-only", "flexible-religously"] }, // no location
];

const tagCategoryBySlug = new Map<string, string | null>([
  ["boys-only", "gender"],
  ["girls-only", "gender"],
  ["coed", "gender"],
  ["rz-modern-orthodox", "affiliation"],
  ["flexible-religously", "affiliation"],
  ["jerusalem", "location"],
  ["haifa", "location"],
]);

const regions = [
  { slug: "jerusalem-region", memberSlugs: ["jerusalem"] },
  { slug: "north", memberSlugs: ["haifa"] },
];

describe("matchesSelections", () => {
  it("ORs within a category and ANDs across categories, same as buildTagAndClauses", () => {
    const selections = { duration: [], tags: ["boys-only", "girls-only", "rz-modern-orthodox"] };
    // program 1: boys-only + rz-modern-orthodox -> gender OR satisfied, affiliation OR satisfied
    expect(matchesSelections(programs[0], selections, tagCategoryBySlug)).toBe(true);
    // program 2: girls-only + rz-modern-orthodox -> also satisfied (OR within gender)
    expect(matchesSelections(programs[1], selections, tagCategoryBySlug)).toBe(true);
    // program 3: coed + flexible-religously -> gender OR fails (neither boys-only nor girls-only)
    expect(matchesSelections(programs[2], selections, tagCategoryBySlug)).toBe(false);
  });

  it("applies duration as a straightforward AND alongside tag groups", () => {
    const selections = { duration: ["SEMESTER"], tags: ["coed"] };
    expect(matchesSelections(programs[2], selections, tagCategoryBySlug)).toBe(true);
    expect(matchesSelections(programs[3], selections, tagCategoryBySlug)).toBe(false); // wrong duration
  });

  it("excludes a program with no tag in a filtered category entirely", () => {
    const selections = { duration: [], tags: ["rz-modern-orthodox"] };
    expect(matchesSelections(programs[3], selections, tagCategoryBySlug)).toBe(false); // program 4 has no affiliation tag at all
  });
});

describe("computeFacetCounts", () => {
  it("counts each duration option against the current tag selection, ignoring current duration selection", () => {
    const selections = { duration: ["GAP_YEAR"], tags: [] };
    const { duration } = computeFacetCounts(
      programs,
      selections,
      tagCategoryBySlug,
      ["GAP_YEAR", "SEMESTER", "SUMMER"],
      new Map()
    );
    // Counts reflect "what if this were the only duration selected" -- independent of
    // the currently active GAP_YEAR selection, since duration options don't depend on
    // themselves.
    expect(duration).toEqual({ GAP_YEAR: 3, SEMESTER: 1, SUMMER: 1 });
  });

  it("counts each tag option against every OTHER dimension, standalone within its own category", () => {
    const selections = { duration: [], tags: ["girls-only"] };
    const categorySlugOptions = new Map([
      ["gender", ["boys-only", "girls-only", "coed"]],
      ["affiliation", ["rz-modern-orthodox", "flexible-religously"]],
    ]);
    const { tags } = computeFacetCounts(programs, selections, tagCategoryBySlug, [], categorySlugOptions);
    // gender options ignore the current gender selection (girls-only) entirely --
    // each is evaluated alone (no other active dims, so no cross-category narrowing).
    expect(tags["boys-only"]).toBe(2); // programs 1, 5
    expect(tags["girls-only"]).toBe(1); // program 2
    expect(tags["coed"]).toBe(2); // programs 3, 4
    // affiliation options DO stay narrowed by the active girls-only selection, since
    // that's a different category (gender) and ANDs against affiliation -- only
    // program 2 (girls-only) is a candidate, so each affiliation option's count is
    // just whether program 2 carries that tag.
    expect(tags["rz-modern-orthodox"]).toBe(1); // program 2 has it
    expect(tags["flexible-religously"]).toBe(0); // program 2 doesn't
  });

  it("holds a fixed OTHER category's selection while varying the option's own category", () => {
    // Selecting rz-modern-orthodox (affiliation) should narrow gender option counts,
    // since affiliation is a different category and ANDs against gender.
    const selections = { duration: [], tags: ["rz-modern-orthodox"] };
    const categorySlugOptions = new Map([["gender", ["boys-only", "girls-only", "coed"]]]);
    const { tags } = computeFacetCounts(programs, selections, tagCategoryBySlug, [], categorySlugOptions);
    expect(tags["boys-only"]).toBe(1); // program 1 only (program 5 has no rz tag)
    expect(tags["girls-only"]).toBe(1); // program 2
    expect(tags["coed"]).toBe(0); // no coed program has rz-modern-orthodox
  });
});

describe("computeRegionCounts", () => {
  it("ORs a region's memberSlugs and excludes the location category from other selections", () => {
    const selections = { duration: [], tags: [] };
    const counts = computeRegionCounts(programs, selections, tagCategoryBySlug, regions);
    expect(counts["jerusalem-region"]).toBe(2); // programs 1, 2
    expect(counts["north"]).toBe(1); // program 3
  });

  it("still ANDs against non-location dimensions", () => {
    const selections = { duration: [], tags: ["girls-only"] };
    const counts = computeRegionCounts(programs, selections, tagCategoryBySlug, regions);
    expect(counts["jerusalem-region"]).toBe(1); // only program 2 is girls-only + jerusalem
    expect(counts["north"]).toBe(0);
  });
});

describe("dropOneCounts", () => {
  it("reports the count with each active dimension cleared, one at a time", () => {
    const selections = { duration: ["GAP_YEAR"], tags: ["boys-only", "rz-modern-orthodox"] };
    const activeDimensions = [
      { kind: "duration" as const },
      { kind: "category" as const, category: "gender", label: "Gender" },
      { kind: "category" as const, category: "affiliation", label: "Religious affiliation" },
    ];
    const results = dropOneCounts(programs, selections, tagCategoryBySlug, activeDimensions);
    // Full combo (GAP_YEAR + boys-only + rz-modern-orthodox) matches only program 1.
    expect(matchesSelections(programs[0], selections, tagCategoryBySlug)).toBe(true);
    const byLabel = Object.fromEntries(
      results.map((r) => [r.dimension.kind === "duration" ? "duration" : r.dimension.label, r.count])
    );
    expect(byLabel["duration"]).toBe(1); // dropping duration: boys-only + rz-modern-orthodox -> program 1 only (program 5 lacks rz)
    expect(byLabel["Gender"]).toBe(2); // dropping gender: GAP_YEAR + rz-modern-orthodox -> programs 1, 2
    expect(byLabel["Religious affiliation"]).toBe(2); // dropping affiliation: GAP_YEAR + boys-only -> programs 1, 5
  });

  it("clearing the location category is equivalent to clearing Region, since Region has no separate state", () => {
    const selections = { duration: [], tags: ["jerusalem", "girls-only"] };
    const activeDimensions = [{ kind: "category" as const, category: "location", label: "Region" }];
    const results = dropOneCounts(programs, selections, tagCategoryBySlug, activeDimensions);
    expect(results[0].count).toBe(1); // just girls-only -> program 2
  });
});
