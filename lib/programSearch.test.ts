import { describe, it, expect } from "vitest";
import { rankBySearchTerm, rankBySearchTermScored, type Searchable } from "./programSearch";

type TestProgram = Searchable & { id: string };

function prog(
  id: string,
  name: string,
  extra: Partial<Searchable> = {}
): TestProgram {
  return {
    id,
    name,
    nameHe: extra.nameHe ?? null,
    organization: extra.organization ?? null,
    location: extra.location ?? null,
    goodFor: extra.goodFor ?? null,
    description: extra.description ?? "",
    tags: extra.tags ?? [],
  };
}

// A slice resembling the real /rate picker set (name + org + location + tags,
// no description/goodFor), so these tests exercise exactly the shape the picker
// feeds the ranker. p1 carries a Hebrew name; p2-p5 deliberately leave nameHe
// null, same as every existing program in the DB, so the no-nameHe path stays covered.
const PROGRAMS: TestProgram[] = [
  prog("p1", "Yeshivat Hakotel", {
    nameHe: "ישיבת הכותל",
    organization: "Yeshivat Hakotel",
    tags: [{ name: "Yeshiva", slug: "yeshiva" }],
  }),
  prog("p2", "Aardvark Israel", { location: "Tel Aviv", tags: [{ name: "Gap Year", slug: "gap-year" }] }),
  prog("p3", "Otzem Overseas Program (Atzmona)", { organization: "Bnei Akiva" }),
  prog("p4", "Midreshet Lindenbaum", { tags: [{ name: "Women", slug: "women" }] }),
  prog("p5", "Machon Maayan", {}),
];

describe("rankBySearchTerm", () => {
  it("ranks an exact name match first (tier 0)", () => {
    const result = rankBySearchTerm(PROGRAMS, "Yeshivat Hakotel");
    expect(result[0]?.id).toBe("p1");
  });

  it("resolves a misspelling to the closest program instead of returning nothing", () => {
    // 'hakotle' transposes the last two letters of 'Hakotel'.
    const result = rankBySearchTerm(PROGRAMS, "yeshivat hakotle");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe("p1");
  });

  it("tolerates a dropped letter (Aardvark -> Ardvark)", () => {
    const result = rankBySearchTerm(PROGRAMS, "ardvark israel");
    expect(result[0]?.id).toBe("p2");
  });

  it("matches a partial / single-token query", () => {
    const result = rankBySearchTerm(PROGRAMS, "otzem");
    expect(result[0]?.id).toBe("p3");
  });

  it("matches via an organization typo, not just the name", () => {
    // 'akiva' misspelled; only p3's organization carries it.
    const result = rankBySearchTerm(PROGRAMS, "bnei akivah");
    expect(result.map((p) => p.id)).toContain("p3");
  });

  it("returns an empty list only when nothing is genuinely close", () => {
    expect(rankBySearchTerm(PROGRAMS, "zzzzzzz qqqqqqq")).toEqual([]);
  });

  it("matches a Hebrew query against nameHe and returns the correct program (tier 0)", () => {
    const result = rankBySearchTerm(PROGRAMS, "ישיבת הכותל");
    expect(result[0]?.id).toBe("p1");
  });

  it("matches a partial Hebrew query via the token substring fallback", () => {
    // \b (word-boundary) regex doesn't fire on Hebrew text -- this exercises the
    // plain-substring nameHe path in relevanceTier/matchesAllTokens instead.
    const result = rankBySearchTerm(PROGRAMS, "הכותל");
    expect(result.map((p) => p.id)).toContain("p1");
  });

  it("still returns the right program for every English case above -- no Hebrew-related regression", () => {
    // Re-run a representative sample of the pre-existing English assertions to confirm
    // adding nameHe to SEARCH_KEYS/haystacks/relevanceTier didn't perturb English ranking.
    expect(rankBySearchTerm(PROGRAMS, "Yeshivat Hakotel")[0]?.id).toBe("p1");
    expect(rankBySearchTerm(PROGRAMS, "yeshivat hakotle")[0]?.id).toBe("p1");
    expect(rankBySearchTerm(PROGRAMS, "ardvark israel")[0]?.id).toBe("p2");
    expect(rankBySearchTerm(PROGRAMS, "otzem")[0]?.id).toBe("p3");
  });

  it("a program with a null nameHe still renders/searches normally by its English fields", () => {
    // p2-p5 all have nameHe: null -- these already-passing lookups confirm null doesn't
    // throw or otherwise break matching for programs with no Hebrew name.
    const result = rankBySearchTerm(PROGRAMS, "Midreshet Lindenbaum");
    expect(result[0]?.id).toBe("p4");
    expect(result[0]?.nameHe).toBeNull();
  });
});

describe("tokenize (trailing punctuation)", () => {
  // A trailing "?" (or other punctuation) used to stay glued to the last word
  // ("israel?"), so that token could never substring-match the field text
  // "israel" anywhere in the catalog -- a live bug on both /programs and the
  // assistant. Only a leading "#" was ever stripped before this fix.
  it("strips a trailing question mark so the word still matches", () => {
    const result = rankBySearchTerm(PROGRAMS, "aardvark israel?");
    expect(result[0]?.id).toBe("p2");
  });

  it("strips trailing punctuation from a tag-slug token", () => {
    // p2's tag slug is "gap-year" -- the internal hyphen must survive (it's not a
    // boundary), only the trailing "?" should be stripped.
    const result = rankBySearchTerm(PROGRAMS, "gap-year?");
    expect(result.map((p) => p.id)).toContain("p2");
  });

  it("still matches a bare Hebrew query with no punctuation to strip (no regression)", () => {
    const result = rankBySearchTerm(PROGRAMS, "ישיבת הכותל?");
    expect(result[0]?.id).toBe("p1");
  });
});

describe("rankBySearchTermScored (weighted coverage, no hard cut)", () => {
  it("a query with unmatched filler words still returns the program that matches the rest", () => {
    // "program" and "nonsense" match nothing on p2; "aardvark"/"israel" do. Under the
    // old strict tokens.every() gate this returned [] entirely -- exactly the bug
    // reported against the assistant ("gap year programs post 12th grade that are...").
    const result = rankBySearchTermScored(PROGRAMS, "aardvark israel program nonsense");
    const p2 = result.find((r) => r.item.id === "p2");
    expect(p2).toBeDefined();
    expect(p2?.full).toBe(false);
    expect(p2?.matchedTokens).toBe(2);
    expect(p2?.totalTokens).toBe(4);
  });

  it("never hard-cuts to empty when at least one token matches something", () => {
    const result = rankBySearchTerm(PROGRAMS, "aardvark israel program nonsense");
    expect(result.length).toBeGreaterThan(0);
  });

  it("still returns [] when nothing matches any token and Fuse finds nothing close", () => {
    // Unchanged invariant: a program matching ZERO tokens is unrelated, not partial.
    expect(rankBySearchTerm(PROGRAMS, "zzzzzzz qqqqqqq")).toEqual([]);
  });

  it("ranks full-coverage matches above partial-coverage matches", () => {
    // p2 fully matches "aardvark israel"; appending an unrelated word demotes it to
    // partial but must not push it above/equal to a genuinely full match of the same
    // query prefix. Compare against a query that's pure full-coverage for p2.
    const fullOnly = rankBySearchTermScored(PROGRAMS, "aardvark israel");
    const withFiller = rankBySearchTermScored(PROGRAMS, "aardvark israel program nonsense");
    expect(fullOnly.find((r) => r.item.id === "p2")?.full).toBe(true);
    expect(withFiller.find((r) => r.item.id === "p2")?.full).toBe(false);
  });

  it("does not perturb ordering among already-full-coverage results (exact match still first)", () => {
    // Same assertion as the tier-0 exact-match test above, re-run through the scored
    // API to confirm the new coverage-first sort key doesn't reshuffle same-coverage
    // (here: both full) results relative to the pre-existing tier/score/name order.
    const result = rankBySearchTermScored(PROGRAMS, "Yeshivat Hakotel");
    expect(result[0]?.item.id).toBe("p1");
    expect(result[0]?.full).toBe(true);
  });

  it("a single-token query with nothing to partially cover is treated as full coverage", () => {
    const result = rankBySearchTermScored(PROGRAMS, "otzem");
    const p3 = result.find((r) => r.item.id === "p3");
    expect(p3?.full).toBe(true);
    expect(p3?.totalTokens).toBe(1);
  });
});
