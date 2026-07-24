import { describe, it, expect } from "vitest";
import { computeBestForPhrases, computeVarianceNote, MIN_RESPONSES_PER_QUESTION, TIER_MULTIPLIER } from "./pollBestFor";
import type { BestForQuestionInput } from "./pollBestFor";

function q(overrides: Partial<BestForQuestionInput> & { key: string }): BestForQuestionInput {
  return {
    mean: 3,
    count: 10,
    lowPhrase: `${overrides.key}-low`,
    highPhrase: `${overrides.key}-high`,
    tier: "CONTEXTUAL",
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

  it("excludes questions missing a mean", () => {
    const result = computeBestForPhrases([
      q({ key: "nomean", mean: null }),
      q({ key: "other", mean: 3 }), // distance 0, also excluded
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

  describe("tier weighting", () => {
    it("a DEFINING question outranks a CONTEXTUAL one at the same distance", () => {
      const result = computeBestForPhrases([
        q({ key: "defining", mean: 4.0, tier: "DEFINING" }), // dist 1.0 * 2.0 = 2.0
        q({ key: "contextual", mean: 2.0, tier: "CONTEXTUAL" }), // dist 1.0 * 1.0 = 1.0
        q({ key: "filler", mean: 1.0, tier: "CONTEXTUAL", count: 3 }), // dist 2.0 * 1.0 = 2.0, just under defining via tie-break
      ]);
      // defining (score 2.0) should be first
      expect(result[0]).toBe("defining-high");
    });

    it("a smaller distance can outrank a larger one when tier weight compensates", () => {
      // SIGNIFICANT dist 1.8 * 1.3 = 2.34; DEFINING dist 1.0 * 2.0 = 2.0 -- SIGNIFICANT wins here
      // but DEFINING dist 1.8 * 2.0 = 3.6 beats SIGNIFICANT dist 1.8 * 1.3 = 2.34
      const result = computeBestForPhrases([
        q({ key: "low_distance_defining", mean: 4.0, tier: "DEFINING" }), // 1.0 * 2.0 = 2.0
        q({ key: "high_distance_significant", mean: 4.8, tier: "SIGNIFICANT" }), // 1.8 * 1.3 = 2.34
      ]);
      expect(result).toEqual(["high_distance_significant-high", "low_distance_defining-high"]);
    });

    it("verifies the exact multiplier constants used for scoring", () => {
      expect(TIER_MULTIPLIER.DEFINING).toBe(2.0);
      expect(TIER_MULTIPLIER.SIGNIFICANT).toBe(1.3);
      expect(TIER_MULTIPLIER.CONTEXTUAL).toBe(1.0);
    });
  });

  describe("EXCLUDED short-circuit", () => {
    it("an EXCLUDED question never appears, however extreme its mean", () => {
      const result = computeBestForPhrases([
        q({ key: "excluded", mean: 5.0, tier: "EXCLUDED" }),
        q({ key: "a", mean: 4.5 }),
        q({ key: "b", mean: 1.5 }),
      ]);
      expect(result).not.toContain("excluded-high");
      expect(result).toEqual(["a-high", "b-low"]);
    });

    it("EXCLUDED questions alone never produce a strip even if there are several", () => {
      const result = computeBestForPhrases([
        q({ key: "excluded1", mean: 5.0, tier: "EXCLUDED" }),
        q({ key: "excluded2", mean: 1.0, tier: "EXCLUDED" }),
      ]);
      expect(result).toEqual([]);
    });
  });

  describe("asymmetric phrases", () => {
    it("a unipolar (highPhrase-only) question contributes when the mean is high", () => {
      const result = computeBestForPhrases([
        q({ key: "unipolar", mean: 4.8, lowPhrase: null, highPhrase: "great outcome" }),
        q({ key: "other", mean: 1.5 }),
      ]);
      expect(result).toContain("great outcome");
    });

    it("a unipolar (highPhrase-only) question is silently dropped when the mean is low -- never backfilled", () => {
      const result = computeBestForPhrases([
        q({ key: "unipolar", mean: 1.2, lowPhrase: null, highPhrase: "great outcome" }),
        q({ key: "other", mean: 4.5 }),
      ]);
      expect(result).not.toContain("great outcome");
      expect(result).toEqual([]); // only 1 candidate qualifies after the drop -> below min-2
    });

    it("degrades cleanly to no strip when every eligible question points at an unphrased end", () => {
      const result = computeBestForPhrases([
        q({ key: "u1", mean: 1.2, lowPhrase: null, highPhrase: "strength one" }),
        q({ key: "u2", mean: 1.4, lowPhrase: null, highPhrase: "strength two" }),
      ]);
      expect(result).toEqual([]);
    });
  });

  describe("tie-break determinism", () => {
    it("breaks equal scores by response count, higher n first", () => {
      const result = computeBestForPhrases([
        q({ key: "fewer", mean: 4.0, count: 5 }), // dist 1.0, score 1.0
        q({ key: "more", mean: 2.0, count: 20 }), // dist 1.0, score 1.0
      ]);
      expect(result).toEqual(["more-low", "fewer-high"]);
    });

    it("breaks equal score AND equal count by key ascending", () => {
      const result = computeBestForPhrases([
        q({ key: "zebra", mean: 4.0, count: 10 }),
        q({ key: "alpha", mean: 2.0, count: 10 }),
      ]);
      expect(result).toEqual(["alpha-low", "zebra-high"]);
    });

    it("produces the same result regardless of input order (stable under shuffling)", () => {
      const inputs = [
        q({ key: "c", mean: 4.0, count: 10 }),
        q({ key: "a", mean: 2.0, count: 10 }),
        q({ key: "b", mean: 4.9, count: 10 }),
      ];
      const forward = computeBestForPhrases(inputs);
      const reversed = computeBestForPhrases([...inputs].reverse());
      expect(forward).toEqual(reversed);
    });
  });

  describe("eligibility gates are unaffected by tier", () => {
    it("a DEFINING question with n < 3 is still excluded", () => {
      const result = computeBestForPhrases([
        q({ key: "defining_toofew", mean: 5.0, tier: "DEFINING", count: 2 }),
        q({ key: "other", mean: 4.5 }),
      ]);
      expect(result).not.toContain("defining_toofew-high");
    });

    it("tier cannot rescue a below-min-2 result", () => {
      const result = computeBestForPhrases([q({ key: "only", mean: 5.0, tier: "DEFINING" })]);
      expect(result).toEqual([]);
    });

    it("a DEFINING question still needs distance >= 0.5", () => {
      const result = computeBestForPhrases([
        q({ key: "defining_neutral", mean: 3.2, tier: "DEFINING" }), // dist 0.2, even *2.0 doesn't clear the pre-multiplier gate
        q({ key: "other", mean: 4.5 }),
      ]);
      expect(result).not.toContain("defining_neutral-high");
    });
  });
});

describe("computeVarianceNote", () => {
  it("true when mean >= 3.5 and count >= 3", () => {
    expect(computeVarianceNote({ mean: 3.5, count: 3 })).toBe(true);
    expect(computeVarianceNote({ mean: 4.2, count: 20 })).toBe(true);
  });

  it("false when mean is below 3.5", () => {
    expect(computeVarianceNote({ mean: 3.4, count: 20 })).toBe(false);
  });

  it("false when count is below the response floor, even with a high mean", () => {
    expect(computeVarianceNote({ mean: 5, count: 2 })).toBe(false);
  });

  it("false when the question is absent or unanswered", () => {
    expect(computeVarianceNote(undefined)).toBe(false);
    expect(computeVarianceNote({ mean: null, count: 0 })).toBe(false);
  });
});
