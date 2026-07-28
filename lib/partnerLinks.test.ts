import { describe, it, expect } from "vitest";
import {
  parsePartnerLinksConfig,
  resolvePartnerSlot,
  resolveProgramPageSlot,
  isRenderableSlot,
  type PartnerLinkSlot,
  type PartnerLinksConfig,
} from "./partnerLinksConfig";

/** A fully-valid, renderable slot; override per test. */
function slot(overrides: Partial<PartnerLinkSlot> = {}): PartnerLinkSlot {
  return {
    id: overrides.id ?? "s1",
    placement: "COMPARE",
    enabled: true,
    header: "",
    description: "",
    label: "Ask a mentor",
    url: "https://israeltrack.example/mentor",
    showDisclosure: true,
    scope: "all",
    scopeValues: [],
    ...overrides,
  };
}

function config(slots: PartnerLinkSlot[]): PartnerLinksConfig {
  return { slots };
}

describe("parsePartnerLinksConfig (fail-closed + independence)", () => {
  it("missing / unreadable config → empty", () => {
    expect(parsePartnerLinksConfig(null).slots).toEqual([]);
    expect(parsePartnerLinksConfig("not json{").slots).toEqual([]);
    expect(parsePartnerLinksConfig('{"slots":"nope"}').slots).toEqual([]);
    expect(parsePartnerLinksConfig("42").slots).toEqual([]);
  });

  it("drops a single malformed slot without discarding the valid ones (independence)", () => {
    const raw = JSON.stringify({
      slots: [
        slot({ id: "good" }),
        { id: "bad", placement: "NOT_A_PLACEMENT", url: "https://x.example" },
        slot({ id: "good2", url: "javascript:alert(1)" }), // invalid url → dropped on parse
      ],
    });
    const parsed = parsePartnerLinksConfig(raw);
    expect(parsed.slots.map((s) => s.id)).toEqual(["good"]);
  });

  it("accepts a blank-url draft slot (stored) but it is not renderable", () => {
    const raw = JSON.stringify({ slots: [slot({ id: "draft", url: "" })] });
    const parsed = parsePartnerLinksConfig(raw);
    expect(parsed.slots).toHaveLength(1);
    expect(isRenderableSlot(parsed.slots[0])).toBe(false);
  });
});

describe("isRenderableSlot / resolvePartnerSlot (fail-closed rendering)", () => {
  it("disabled slot → nothing", () => {
    expect(resolvePartnerSlot(config([slot({ enabled: false })]), "COMPARE")).toBeNull();
  });
  it("blank url → nothing (even with header/description/label filled)", () => {
    const s = slot({ url: "", header: "H", description: "D", label: "L" });
    expect(resolvePartnerSlot(config([s]), "COMPARE")).toBeNull();
  });
  it("blank label → nothing", () => {
    expect(resolvePartnerSlot(config([slot({ label: "" })]), "COMPARE")).toBeNull();
  });
  it("enabled + valid url + label → renders", () => {
    const s = slot();
    expect(resolvePartnerSlot(config([s]), "COMPARE")?.id).toBe(s.id);
  });
  it("empty config → nothing everywhere", () => {
    for (const p of ["PROGRAM_NO_REFERENCES", "PROGRAM_LOCKED", "COMPARE", "POST_POLL", "EMPTY_SEARCH"] as const) {
      expect(resolvePartnerSlot(config([]), p)).toBeNull();
    }
  });
});

describe("scope resolution + specificity", () => {
  const programCtx = { programId: "prog_1", categories: ["gender", "affiliation"] };

  it("categories scope matches only when a category overlaps", () => {
    const match = slot({ id: "cat", placement: "PROGRAM_LOCKED", scope: "categories", scopeValues: ["gender"] });
    const noMatch = slot({ id: "cat2", placement: "PROGRAM_LOCKED", scope: "categories", scopeValues: ["age"] });
    expect(resolvePartnerSlot(config([match]), "PROGRAM_LOCKED", programCtx)?.id).toBe("cat");
    expect(resolvePartnerSlot(config([noMatch]), "PROGRAM_LOCKED", programCtx)).toBeNull();
  });

  it("programs scope matches only the listed program id", () => {
    const s = slot({ id: "prog", placement: "PROGRAM_LOCKED", scope: "programs", scopeValues: ["prog_1"] });
    expect(resolvePartnerSlot(config([s]), "PROGRAM_LOCKED", programCtx)?.id).toBe("prog");
    expect(resolvePartnerSlot(config([s]), "PROGRAM_LOCKED", { programId: "other" })).toBeNull();
  });

  it("most specific scope wins: programs > categories > all", () => {
    const all = slot({ id: "all", placement: "PROGRAM_LOCKED", scope: "all" });
    const cat = slot({ id: "cat", placement: "PROGRAM_LOCKED", scope: "categories", scopeValues: ["gender"] });
    const prog = slot({ id: "prog", placement: "PROGRAM_LOCKED", scope: "programs", scopeValues: ["prog_1"] });
    // listed all/cat first, prog last -- prog still wins
    expect(resolvePartnerSlot(config([all, cat, prog]), "PROGRAM_LOCKED", programCtx)?.id).toBe("prog");
    // without the program-scoped one, category beats all
    expect(resolvePartnerSlot(config([all, cat]), "PROGRAM_LOCKED", programCtx)?.id).toBe("cat");
  });

  it("tie on scope → first listed in admin order wins", () => {
    const a = slot({ id: "first", placement: "PROGRAM_LOCKED", scope: "all" });
    const b = slot({ id: "second", placement: "PROGRAM_LOCKED", scope: "all" });
    expect(resolvePartnerSlot(config([a, b]), "PROGRAM_LOCKED", programCtx)?.id).toBe("first");
  });

  it("compare / post-poll / empty-search accept scope 'all' only", () => {
    const progScoped = slot({ id: "p", placement: "COMPARE", scope: "programs", scopeValues: ["prog_1"] });
    // even with a matching program context, a non-'all' slot never resolves here
    expect(
      resolvePartnerSlot(config([progScoped]), "COMPARE", { programId: "prog_1", allowedScopes: ["all"] })
    ).toBeNull();
    const allScoped = slot({ id: "a", placement: "COMPARE", scope: "all" });
    expect(resolvePartnerSlot(config([allScoped]), "COMPARE", { allowedScopes: ["all"] })?.id).toBe("a");
  });
});

describe("resolveProgramPageSlot (one-per-page)", () => {
  const base = { programId: "prog_1", categories: [] as string[] };
  const noRefs = slot({ id: "noRefs", placement: "PROGRAM_NO_REFERENCES", scope: "all" });
  const locked = slot({ id: "locked", placement: "PROGRAM_LOCKED", scope: "all" });

  it("no references, poll visible → slot 1 renders in references region", () => {
    const r = resolveProgramPageSlot(config([noRefs, locked]), { ...base, hasReferences: false, pollVisible: true });
    expect(r).toEqual({ slot: expect.objectContaining({ id: "noRefs" }), placement: "PROGRAM_NO_REFERENCES" });
  });

  it("program HAS references → slot 1 never renders", () => {
    const r = resolveProgramPageSlot(config([noRefs]), { ...base, hasReferences: true, pollVisible: true });
    expect(r).toBeNull();
  });

  it("slots 1 and 4 both qualify → only slot 4 renders", () => {
    const r = resolveProgramPageSlot(config([noRefs, locked]), {
      ...base,
      hasReferences: false, // slot 1 qualifies
      pollVisible: false, // slot 4 qualifies
    });
    expect(r?.placement).toBe("PROGRAM_LOCKED");
    expect(r?.slot.id).toBe("locked");
  });

  it("slot 4 qualifies but is not configured, slot 1 is → slot 1 renders", () => {
    const r = resolveProgramPageSlot(config([noRefs]), { ...base, hasReferences: false, pollVisible: false });
    expect(r?.placement).toBe("PROGRAM_NO_REFERENCES");
  });

  it("nothing qualifies → null", () => {
    const r = resolveProgramPageSlot(config([noRefs, locked]), { ...base, hasReferences: true, pollVisible: true });
    expect(r).toBeNull();
  });
});
