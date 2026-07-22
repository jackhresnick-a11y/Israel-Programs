import { describe, it, expect } from "vitest";
import { resolveReferenceVisibility, type ReferenceConfigLike } from "./referenceVisibility";

function config(overrides: Partial<ReferenceConfigLike> = {}): ReferenceConfigLike {
  return { visibility: "AUTO", unlockedAt: null, minToShow: 3, ...overrides };
}

describe("resolveReferenceVisibility", () => {
  it("FORCE_HIDE always wins, regardless of count or unlock state", () => {
    expect(resolveReferenceVisibility(0, config({ visibility: "FORCE_HIDE" }))).toBe(false);
    expect(resolveReferenceVisibility(10, config({ visibility: "FORCE_HIDE" }))).toBe(false);
    expect(resolveReferenceVisibility(10, config({ visibility: "FORCE_HIDE", unlockedAt: new Date() }))).toBe(false);
  });

  it("FORCE_SHOW shows regardless of count", () => {
    expect(resolveReferenceVisibility(0, config({ visibility: "FORCE_SHOW" }))).toBe(true);
    expect(resolveReferenceVisibility(1, config({ visibility: "FORCE_SHOW" }))).toBe(true);
  });

  describe("AUTO, not yet unlocked", () => {
    it("below threshold -> hidden", () => {
      expect(resolveReferenceVisibility(0, config())).toBe(false);
      expect(resolveReferenceVisibility(2, config())).toBe(false);
    });

    it("at or above threshold -> shown", () => {
      expect(resolveReferenceVisibility(3, config())).toBe(true);
      expect(resolveReferenceVisibility(10, config())).toBe(true);
    });

    it("respects a custom minToShow", () => {
      expect(resolveReferenceVisibility(4, config({ minToShow: 5 }))).toBe(false);
      expect(resolveReferenceVisibility(5, config({ minToShow: 5 }))).toBe(true);
    });
  });

  describe("AUTO, sticky once unlocked", () => {
    it("stays shown even if the count later drops below threshold", () => {
      expect(resolveReferenceVisibility(1, config({ unlockedAt: new Date() }))).toBe(true);
      expect(resolveReferenceVisibility(0, config({ unlockedAt: new Date() }))).toBe(true);
    });
  });

  it("caller must additionally suppress an empty list -- this function alone doesn't see the list", () => {
    // FORCE_SHOW with zero approved references still resolves true here; the empty-list
    // guard lives in lib/referenceConfig.ts's getReferenceListVisibility, not here.
    expect(resolveReferenceVisibility(0, config({ visibility: "FORCE_SHOW" }))).toBe(true);
  });
});
