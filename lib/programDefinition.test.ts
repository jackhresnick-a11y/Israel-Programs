import { describe, it, expect } from "vitest";
import { programDefinitionSentence } from "./programDefinition";
import type { ProgramDefinitionTag } from "./programDefinition";

const OTZEM_TAGS: ProgramDefinitionTag[] = [
  { slug: "overseas-program", category: null },
  { slug: "age-gap-year", category: "age" },
  { slug: "mechina", category: null },
  { slug: "pre-army", category: null },
  { slug: "boys-only", category: "gender" },
  { slug: "essence-spiritual-growth", category: "essence" },
  { slug: "essence-pre-military", category: "essence" },
  { slug: "integration-high", category: "israeli-integration" },
  { slug: "rz-modern-orthodox", category: "affiliation" },
  { slug: "southern-israel", category: "location" },
];

describe("programDefinitionSentence", () => {
  it("renders the full sentence for the real Otzem tag set", () => {
    const result = programDefinitionSentence({
      name: "Otzem Overseas Program (Atzmona)",
      location: "Chalutza (Border of Egypt and Gaza), southern Israel",
      tags: OTZEM_TAGS,
    });
    expect(result).toBe(
      "Otzem Overseas Program (Atzmona) is a religious-Zionist mechina in Chalutza, southern Israel, for gap-year students, men only."
    );
  });

  it("returns null for a program with no tags and no location", () => {
    expect(programDefinitionSentence({ name: "No Data Program", location: null, tags: [] })).toBeNull();
  });

  it("falls back to a location tag phrase when Program.location is null", () => {
    const result = programDefinitionSentence({
      name: "P",
      location: null,
      tags: [
        { slug: "rz-modern-orthodox", category: "affiliation" },
        { slug: "jerusalem", category: "location" },
      ],
    });
    expect(result).toContain("in Jerusalem");
  });

  it("omits the location clause entirely when neither location nor a location tag is present", () => {
    const result = programDefinitionSentence({
      name: "P",
      location: null,
      tags: [
        { slug: "rz-modern-orthodox", category: "affiliation" },
        { slug: "age-gap-year", category: "age" },
      ],
    });
    expect(result).not.toContain(" in ");
    expect(result).toBe("P is a religious-Zionist program, for gap-year students.");
  });

  it("ignores an unmapped tag slug -- contributes no clause", () => {
    const result = programDefinitionSentence({
      name: "P",
      location: "Somewhere, Israel",
      tags: [
        { slug: "rz-modern-orthodox", category: "affiliation" },
        { slug: "some-unmapped-slug", category: "affiliation" },
      ],
    });
    expect(result).toBe("P is a religious-Zionist program in Somewhere, Israel.");
  });

  it("renders nothing when only one clause resolves (the two-clause floor)", () => {
    const result = programDefinitionSentence({
      name: "P",
      location: null,
      tags: [{ slug: "boys-only", category: "gender" }],
    });
    expect(result).toBeNull();
  });

  it("the generic 'program' type fallback never counts toward the two-clause floor", () => {
    // Only gender resolves (one clause) plus the type fallback -- still null.
    const result = programDefinitionSentence({
      name: "P",
      location: null,
      tags: [{ slug: "coed", category: "gender" }],
    });
    expect(result).toBeNull();
  });

  it("renders the type noun without an affiliation clause when no affiliation tag matches", () => {
    const result = programDefinitionSentence({
      name: "P",
      location: "Tel Aviv",
      tags: [
        { slug: "mechina", category: null },
        { slug: "age-college", category: "age" },
      ],
    });
    expect(result).toBe("P is a mechina in Tel Aviv, for college-age students.");
  });
});
