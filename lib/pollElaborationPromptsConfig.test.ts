import { describe, it, expect } from "vitest";
import {
  parseElaborationPrompts,
  enabledPrompts,
  remainingPrompts,
  DEFAULT_ELABORATION_PROMPTS,
  type ElaborationPrompt,
} from "./pollElaborationPromptsConfig";

function p(overrides: Partial<ElaborationPrompt> & { key: string }): ElaborationPrompt {
  return { text: `${overrides.key} text`, enabled: true, ...overrides };
}

describe("parseElaborationPrompts", () => {
  it("falls back to the seed defaults when the SiteContent key is absent", () => {
    expect(parseElaborationPrompts(null)).toEqual(DEFAULT_ELABORATION_PROMPTS);
  });

  it("falls back to the seed defaults on unparseable JSON", () => {
    expect(parseElaborationPrompts("not json")).toEqual(DEFAULT_ELABORATION_PROMPTS);
  });

  it("falls back to the seed defaults when the shape has no prompts array", () => {
    expect(parseElaborationPrompts(JSON.stringify({ v: 1 }))).toEqual(DEFAULT_ELABORATION_PROMPTS);
  });

  it("drops one malformed prompt without losing the rest", () => {
    const raw = JSON.stringify({
      v: 1,
      prompts: [
        { key: "good_one", text: "A fine prompt", enabled: true },
        { key: "bad_one", text: "", enabled: true }, // empty text fails min(1)
        { key: "another_good", text: "Also fine", enabled: false },
      ],
    });
    const result = parseElaborationPrompts(raw);
    expect(result.prompts.map((p) => p.key)).toEqual(["good_one", "another_good"]);
  });

  it("falls back to defaults if every prompt in the stored config is malformed", () => {
    const raw = JSON.stringify({ v: 1, prompts: [{ key: "", text: "no key" }] });
    expect(parseElaborationPrompts(raw)).toEqual(DEFAULT_ELABORATION_PROMPTS);
  });

  it("round-trips a valid stored config with disabled prompts preserved", () => {
    const raw = JSON.stringify({
      v: 1,
      prompts: [
        { key: "a", text: "Prompt A", enabled: true },
        { key: "b", text: "Prompt B", enabled: false },
      ],
    });
    expect(parseElaborationPrompts(raw)).toEqual({
      v: 1,
      prompts: [
        { key: "a", text: "Prompt A", enabled: true },
        { key: "b", text: "Prompt B", enabled: false },
      ],
    });
  });
});

describe("enabledPrompts", () => {
  it("excludes disabled prompts, keeping stored order", () => {
    const config = {
      v: 1 as const,
      prompts: [p({ key: "a" }), p({ key: "b", enabled: false }), p({ key: "c" })],
    };
    expect(enabledPrompts(config).map((p) => p.key)).toEqual(["a", "c"]);
  });
});

describe("remainingPrompts", () => {
  const all = [p({ key: "a" }), p({ key: "b" }), p({ key: "c" }), p({ key: "d" })];

  it("returns every prompt when nothing has been answered", () => {
    expect(remainingPrompts(all, [])).toEqual(all);
  });

  it("excludes one answered prompt", () => {
    expect(remainingPrompts(all, ["b"]).map((p) => p.key)).toEqual(["a", "c", "d"]);
  });

  it("excludes three answered prompts, leaving exactly one", () => {
    expect(remainingPrompts(all, ["a", "b", "d"]).map((p) => p.key)).toEqual(["c"]);
  });

  it("returns empty once every prompt has been answered", () => {
    expect(remainingPrompts(all, ["a", "b", "c", "d"])).toEqual([]);
  });

  it("ignores an answered key that doesn't match any prompt", () => {
    expect(remainingPrompts(all, ["nonexistent"])).toEqual(all);
  });
});
