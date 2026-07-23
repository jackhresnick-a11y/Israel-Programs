import { describe, it, expect } from "vitest";
import { rankBySearchTerm, type Searchable } from "./programSearch";

type TestProgram = Searchable & { id: string };

function prog(
  id: string,
  name: string,
  extra: Partial<Searchable> = {}
): TestProgram {
  return {
    id,
    name,
    organization: extra.organization ?? null,
    location: extra.location ?? null,
    goodFor: extra.goodFor ?? null,
    description: extra.description ?? "",
    tags: extra.tags ?? [],
  };
}

// A slice resembling the real /rate picker set (name + org + location + tags,
// no description/goodFor), so these tests exercise exactly the shape the picker
// feeds the ranker.
const PROGRAMS: TestProgram[] = [
  prog("p1", "Yeshivat Hakotel", { organization: "Yeshivat Hakotel", tags: [{ name: "Yeshiva", slug: "yeshiva" }] }),
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
});
