import { describe, it, expect } from "vitest";
import { computeBestForPhrases, computeVarianceNote, MIN_RESPONSES_PER_QUESTION } from "./pollBestFor";
import type { BestForQuestionInput } from "./pollBestFor";

function q(overrides: Partial<BestForQuestionInput> & { key: string }): BestForQuestionInput {
  return {
    mean: 3,
    count: 10,
    lowPhrase: `${overrides.key}-low`,
    highPhrase: `${overrides.key}-high`,
    ...overrides,
  };
}

describe("computeBestForPhrases", () => {
  it("picks the low phrase when mean < 3, high phrase when mean > 3", () => {
    const result = computeBestForPhrases([
      q({ key: "a", mean: 1.5 }),
      q({ key: "b", mean: 4.5 }),
    ]);
    expect(result).toEqual(["a-low", "b-high"]);
  });

  it("ranks by absolute distance from 3.0, descending, and caps at 3", () => {
    const result = computeBestForPhrases([
      q({ key: "small", mean: 3.6 }), // distance 0.6
      q({ key: "big", mean: 4.9 }), // distance 1.9
      q({ key: "mid", mean: 1.2 }), // distance 1.8
      q({ key: "fourth", mean: 4.6 }), // distance 1.6 -- should be excluded, only top 3
    ]);
    expect(result).toEqual(["big-high", "mid-low", "fourth-high"]);
  });

  it("drops candidates with distance < 0.5, even within an otherwise-qualifying top 3", () => {
    const result = computeBestForPhrases([
      q({ key: "far", mean: 4.8 }), // distance 1.8
      q({ key: "also-far", mean: 1.6 }), // distance 1.4
      q({ key: "borderline-below", mean: 3.4 }), // distance 0.4 -- excluded
    ]);
    expect(result).toEqual(["far-high", "also-far-low"]);
  });

  it("keeps a candidate exactly at the 0.5 distance boundary", () => {
    const result = computeBestForPhrases([
      q({ key: "exact", mean: 3.5 }), // distance exactly 0.5
      q({ key: "other", mean: 4.5 }),
    ]);
    expect(result).toContain("exact-high");
  });

  it("excludes questions below the response floor", () => {
    const result = computeBestForPhrases([
      q({ key: "toofew", mean: 4.8, count: MIN_RESPONSES_PER_QUESTION - 1 }),
      q({ key: "enough", mean: 4.8, count: MIN_RESPONSES_PER_QUESTION }),
      q({ key: "also-enough", mean: 1.5, count: MIN_RESPONSES_PER_QUESTION }),
    ]);
    expect(result).toEqual(["enough-high", "also-enough-low"]);
  });

  it("excludes questions missing a mean, or missing either phrase", () => {
    const result = computeBestForPhrases([
      q({ key: "nomean", mean: null }),
      q({ key: "nolow", mean: 4.8, lowPhrase: null }),
      q({ key: "nohigh", mean: 1.2, highPhrase: null }),
    ]);
    expect(result).toEqual([]);
  });

  it("renders nothing (empty array) when fewer than 2 candidates qualify", () => {
    expect(computeBestForPhrases([q({ key: "only-one", mean: 4.8 })])).toEqual([]);
    expect(computeBestForPhrases([])).toEqual([]);
  });

  it("a mean of exactly 3.0 has distance 0 and never qualifies", () => {
    const result = computeBestForPhrases([
      q({ key: "neutral", mean: 3.0 }),
      q({ key: "also-neutral", mean: 3.0 }),
    ]);
    expect(result).toEqual([]);
  });
});

describe("computeVarianceNote", () => {
  it("true when mean >= 3.5 and count >= 3", () => {
    expect(computeVarianceNote(q({ key: "staff_dependent", mean: 3.5, count: 3 }))).toBe(true);
    expect(computeVarianceNote(q({ key: "staff_dependent", mean: 4.2, count: 20 }))).toBe(true);
  });

  it("false when mean is below 3.5", () => {
    expect(computeVarianceNote(q({ key: "staff_dependent", mean: 3.4, count: 20 }))).toBe(false);
  });

  it("false when count is below the response floor, even with a high mean", () => {
    expect(computeVarianceNote(q({ key: "staff_dependent", mean: 5, count: 2 }))).toBe(false);
  });

  it("false when the question is absent or unanswered", () => {
    expect(computeVarianceNote(undefined)).toBe(false);
    expect(computeVarianceNote(q({ key: "staff_dependent", mean: null, count: 0 }))).toBe(false);
  });
});
