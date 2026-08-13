import { describe, it, expect } from "vitest";
import {
  matchTagVocabulary,
  parseDurationKeywords,
  validateParsedQuery,
  buildSearchCriteria,
  unmetLabels,
  type TagVocabEntry,
} from "./searchIntent";
import { rankPrograms, type RankableProgram } from "./flowRank";

const VOCAB: TagVocabEntry[] = [
  { slug: "tech", name: "Tech", category: "essence" },
  { slug: "internship", name: "Internship", category: "essence" },
  { slug: "gap-year", name: "Gap Year", category: null },
  { slug: "rz-modern-orthodox", name: "Religious Zionism/Modern Orthodox", category: "affiliation" },
  { slug: "art", name: "Art", category: "essence" },
];

describe("matchTagVocabulary", () => {
  it("matches a single-word tag as a whole word", () => {
    expect(matchTagVocabulary("looking for a tech program", VOCAB)).toContain("tech");
  });

  it("does not match a tag name as a substring of a larger word", () => {
    // "art" must not fire on "start" or "smart"
    const matched = matchTagVocabulary("this is a smart, start-up focused idea", VOCAB);
    expect(matched).not.toContain("art");
  });

  it("matches a multi-word tag name as a contiguous phrase", () => {
    expect(matchTagVocabulary("a gap year after high school", VOCAB)).toContain("gap-year");
  });

  it("matches a slug with hyphens read as spaces even without the tag's display name", () => {
    // "rz-modern-orthodox"'s name is "Religious Zionism/Modern Orthodox" -- but a
    // message written closer to the slug's own words ("rz modern orthodox") should
    // still resolve via the slug-as-phrase fallback.
    expect(matchTagVocabulary("looking for an rz modern orthodox program", VOCAB)).toContain("rz-modern-orthodox");
  });

  it("matches multiple independent tags in one message", () => {
    const matched = matchTagVocabulary("tech internships during a gap year", VOCAB);
    expect(matched).toEqual(expect.arrayContaining(["tech", "internship", "gap-year"]));
  });

  it("returns an empty array when nothing in the vocabulary matches", () => {
    expect(matchTagVocabulary("something totally unrelated to any tag", VOCAB)).toEqual([]);
  });
});

describe("parseDurationKeywords", () => {
  it("matches a single keyword", () => {
    expect(parseDurationKeywords("looking for a summer program")).toEqual(["SUMMER"]);
  });

  it("matches multiple acceptable durations in one message", () => {
    const result = parseDurationKeywords("summer or semester works for me");
    expect(result).toEqual(expect.arrayContaining(["SUMMER", "SEMESTER"]));
  });

  it("maps yeshiva/seminary to GAP_YEAR without duplicating it", () => {
    expect(parseDurationKeywords("a yeshiva or seminary gap year")).toEqual(["GAP_YEAR"]);
  });

  it("returns an empty array when no duration is implied", () => {
    expect(parseDurationKeywords("something religious and tech-focused")).toEqual([]);
  });
});

describe("validateParsedQuery", () => {
  it("keeps tag slugs that exist in the live vocabulary", () => {
    const result = validateParsedQuery({ tags: ["tech", "gap-year"] }, VOCAB);
    expect(result.tags).toEqual(["tech", "gap-year"]);
  });

  it("drops a tag slug with no matching live Tag row, silently", () => {
    const result = validateParsedQuery({ tags: ["tech", "retired-slug"] }, VOCAB);
    expect(result.tags).toEqual(["tech"]);
  });

  it("preserves q and duration untouched", () => {
    const result = validateParsedQuery({ q: "leftover", duration: ["SUMMER"], tags: [] }, VOCAB);
    expect(result.q).toBe("leftover");
    expect(result.duration).toEqual(["SUMMER"]);
  });
});

describe("buildSearchCriteria", () => {
  it("builds one criterion per parsed tag, labeled with the tag's display name", () => {
    const criteria = buildSearchCriteria({ tags: ["tech", "internship"] }, VOCAB);
    expect(criteria).toHaveLength(2);
    expect(criteria.find((c) => c.questionKey === "tag:tech")?.label).toBe("Tech");
    expect(criteria.find((c) => c.questionKey === "tag:internship")?.label).toBe("Internship");
    expect(criteria.every((c) => c.weight === 1)).toBe(true);
  });

  it("adds a separate duration criterion only when duration is present", () => {
    const withDuration = buildSearchCriteria({ tags: ["tech"], duration: ["GAP_YEAR"] }, VOCAB);
    expect(withDuration.find((c) => c.questionKey === "duration")?.durationValues).toEqual(["GAP_YEAR"]);

    const withoutDuration = buildSearchCriteria({ tags: ["tech"] }, VOCAB);
    expect(withoutDuration.find((c) => c.questionKey === "duration")).toBeUndefined();
  });

  it("falls back to the raw slug as the label if the tag isn't in the given vocab", () => {
    const criteria = buildSearchCriteria({ tags: ["unknown-slug"] }, []);
    expect(criteria[0]?.label).toBe("unknown-slug");
  });

  it("returns no criteria for an empty parsed query", () => {
    expect(buildSearchCriteria({}, VOCAB)).toEqual([]);
  });
});

describe("unmetLabels", () => {
  const tagCategoryBySlug = new Map<string, string | null>([
    ["tech", "essence"],
    ["internship", "essence"],
    ["gap-year", null],
    ["rz-modern-orthodox", "affiliation"],
  ]);

  const programs: RankableProgram[] = [
    { id: "1", name: "Full Match", durationType: "GAP_YEAR", tagSlugs: ["tech", "internship", "rz-modern-orthodox"] },
    { id: "2", name: "Tech Only", durationType: "SUMMER", tagSlugs: ["tech"] },
    { id: "3", name: "No Match", durationType: "SUMMER", tagSlugs: [] },
  ];

  const criteria = buildSearchCriteria({ tags: ["tech", "internship", "rz-modern-orthodox"] }, VOCAB);
  const scored = rankPrograms(programs, criteria, tagCategoryBySlug);

  it("is empty for a program that matches every parsed criterion", () => {
    const fullMatch = scored.find((s) => s.program.id === "1")!;
    expect(unmetLabels(fullMatch, criteria)).toEqual([]);
  });

  it("lists exactly the criteria a partially-matching program misses", () => {
    const techOnly = scored.find((s) => s.program.id === "2")!;
    expect(unmetLabels(techOnly, criteria).sort()).toEqual(["Internship", "Religious Zionism/Modern Orthodox"].sort());
  });

  it("lists every criterion for a program matching none of them -- and the program still appears, never dropped", () => {
    const noMatch = scored.find((s) => s.program.id === "3")!;
    expect(scored.map((s) => s.program.id)).toContain("3");
    expect(unmetLabels(noMatch, criteria).sort()).toEqual(["Internship", "Religious Zionism/Modern Orthodox", "Tech"].sort());
  });
});
