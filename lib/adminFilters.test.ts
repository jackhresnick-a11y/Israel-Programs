import { describe, it, expect } from "vitest";
import { programMatchesTagFilter, resolveEffectiveTier } from "./adminFilters";

describe("programMatchesTagFilter", () => {
  it("matches every program when no tags are selected", () => {
    expect(programMatchesTagFilter([], [])).toBe(true);
    expect(programMatchesTagFilter(["hesder", "boys-only"], [])).toBe(true);
  });

  it("matches when the program carries the one selected tag", () => {
    expect(programMatchesTagFilter(["hesder", "boys-only"], ["hesder"])).toBe(true);
  });

  it("does not match when the program is missing the selected tag", () => {
    expect(programMatchesTagFilter(["hesder"], ["girls-only"])).toBe(false);
  });

  it("requires ALL selected tags (AND semantics), not just one", () => {
    const programTags = ["hesder", "boys-only", "jerusalem"];
    expect(programMatchesTagFilter(programTags, ["hesder", "boys-only"])).toBe(true);
    expect(programMatchesTagFilter(programTags, ["hesder", "girls-only"])).toBe(false);
    expect(programMatchesTagFilter(programTags, ["hesder", "boys-only", "girls-only"])).toBe(false);
  });

  it("is insensitive to the order of selected tags", () => {
    const programTags = ["a", "b", "c"];
    expect(programMatchesTagFilter(programTags, ["c", "a"])).toBe(true);
    expect(programMatchesTagFilter(programTags, ["a", "c"])).toBe(true);
  });
});

describe("resolveEffectiveTier", () => {
  it("returns the saved tier when there is no pending override", () => {
    expect(resolveEffectiveTier(new Map(), "q1", "CONTEXTUAL")).toBe("CONTEXTUAL");
  });

  it("returns the pending override when one exists, regardless of the saved tier", () => {
    const pending = new Map([["q1", "DEFINING" as const]]);
    expect(resolveEffectiveTier(pending, "q1", "CONTEXTUAL")).toBe("DEFINING");
  });

  it("only affects the specific question id edited, not others", () => {
    const pending = new Map([["q1", "DEFINING" as const]]);
    expect(resolveEffectiveTier(pending, "q2", "SIGNIFICANT")).toBe("SIGNIFICANT");
  });
});
