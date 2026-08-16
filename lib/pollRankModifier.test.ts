import { describe, it, expect } from "vitest";
import { pollMultiplier, makePollModifier, MAX_POLL_ADJUSTMENT, type PollRankStats } from "./pollRankModifier";

/**
 * Proves the three hard requirements the /match poll modifier is built on:
 * n = 0 (or no data at all) is exactly neutral (never a penalty, never a float that
 * merely rounds to 1), the multiplier never exceeds +/-10%, and more responses shrink
 * less (pull the multiplier further from 1) than fewer responses at the same average.
 */

const CATALOG_MEAN = 4.588; // matches the live catalog's per-answer recommend mean

function stats(entries: Record<string, { n: number; mean: number }>, catalogMean: number | null = CATALOG_MEAN): PollRankStats {
  return { statsByProgramId: entries, catalogMean };
}

describe("pollMultiplier -- n = 0 neutrality", () => {
  it("a program with no recommend answers of its own is exactly 1 even when other programs have data", () => {
    const s = stats({ p1: { n: 2, mean: 5 } });
    expect(pollMultiplier(s, "p2")).toBe(1); // p2 not in the map at all == n = 0
  });

  it("a program absent from statsByProgramId is exactly 1, not close to 1", () => {
    const s = stats({});
    expect(pollMultiplier(s, "anything")).toBe(1);
  });

  it("catalogMean === null (no recommend answers anywhere yet) is exactly 1 for every program", () => {
    const s = stats({ p1: { n: 50, mean: 5 } }, null);
    expect(pollMultiplier(s, "p1")).toBe(1);
  });

  it("a program whose own average equals the catalog mean stays at 1 (within floating-point noise) at any n -- only n=0 is required to be bit-exact", () => {
    const s = stats({ p1: { n: 1, mean: CATALOG_MEAN }, p2: { n: 40, mean: CATALOG_MEAN } });
    expect(pollMultiplier(s, "p1")).toBeCloseTo(1, 12);
    expect(pollMultiplier(s, "p2")).toBeCloseTo(1, 12);
  });
});

describe("pollMultiplier -- +/-10% bound", () => {
  it("holds across a grid of n and avg, no NaN", () => {
    for (let n = 0; n <= 50; n += 5) {
      for (let avg = 1; avg <= 5; avg += 0.5) {
        const s = stats({ p: { n, mean: avg } });
        const mult = pollMultiplier(s, "p");
        expect(Number.isNaN(mult)).toBe(false);
        expect(mult).toBeGreaterThanOrEqual(1 - MAX_POLL_ADJUSTMENT);
        expect(mult).toBeLessThanOrEqual(1 + MAX_POLL_ADJUSTMENT);
      }
    }
  });

  it("a perfect average with a large n approaches but never exceeds the +10% ceiling", () => {
    const s = stats({ p: { n: 1000, mean: 5 } });
    const mult = pollMultiplier(s, "p");
    expect(mult).toBeGreaterThan(1);
    expect(mult).toBeLessThanOrEqual(1 + MAX_POLL_ADJUSTMENT);
  });

  it("the worst possible average with a large n approaches but never exceeds the -10% floor", () => {
    const s = stats({ p: { n: 1000, mean: 1 } });
    const mult = pollMultiplier(s, "p");
    expect(mult).toBeLessThan(1);
    expect(mult).toBeGreaterThanOrEqual(1 - MAX_POLL_ADJUSTMENT);
  });
});

describe("pollMultiplier -- shrinkage direction and monotonicity", () => {
  it("more responses at the same above-average score pull the multiplier further from 1 than fewer responses", () => {
    const s = stats({ few: { n: 2, mean: 5 }, many: { n: 18, mean: 5 } });
    const few = pollMultiplier(s, "few");
    const many = pollMultiplier(s, "many");
    expect(few).toBeGreaterThan(1);
    expect(many).toBeGreaterThan(few);
  });

  it("more responses at the same below-average score pull the multiplier further from 1 than fewer responses", () => {
    const s = stats({ few: { n: 2, mean: 3 }, many: { n: 18, mean: 3 } });
    const few = pollMultiplier(s, "few");
    const many = pollMultiplier(s, "many");
    expect(few).toBeLessThan(1);
    expect(many).toBeLessThan(few);
  });

  it("at the same n, a higher average never produces a lower multiplier", () => {
    const s = stats({ low: { n: 8, mean: 2 }, mid: { n: 8, mean: 3.5 }, high: { n: 8, mean: 5 } });
    const low = pollMultiplier(s, "low");
    const mid = pollMultiplier(s, "mid");
    const high = pollMultiplier(s, "high");
    expect(low).toBeLessThanOrEqual(mid);
    expect(mid).toBeLessThanOrEqual(high);
  });

  it("matches the measured live-catalog shape: n=2/avg=5 (the median n) is a small nudge, n=18/avg=5 (the max observed n) noticeably larger", () => {
    const s = stats({ typical: { n: 2, mean: 5 }, best: { n: 18, mean: 5 } });
    const typical = pollMultiplier(s, "typical");
    const best = pollMultiplier(s, "best");
    expect(typical).toBeCloseTo(1.0118, 3);
    expect(best).toBeCloseTo(1.0545, 3);
  });
});

describe("pollMultiplier -- degenerate catalog mean (span = 0)", () => {
  it("catalogMean at the scale's high endpoint (5) never divides by zero on the upside", () => {
    const s = stats({ p: { n: 10, mean: 5 } }, 5);
    expect(pollMultiplier(s, "p")).toBe(1);
  });

  it("catalogMean at the scale's low endpoint (1) never divides by zero on the downside", () => {
    const s = stats({ p: { n: 10, mean: 1 } }, 1);
    expect(pollMultiplier(s, "p")).toBe(1);
  });
});

describe("makePollModifier", () => {
  it("binds stats into a (programId) => number function matching pollMultiplier", () => {
    const s = stats({ p1: { n: 5, mean: 5 } });
    const modifier = makePollModifier(s);
    expect(modifier("p1")).toBe(pollMultiplier(s, "p1"));
    expect(modifier("absent")).toBe(1);
  });

  it("null stats (kill switch on, or no recommend question resolved) always returns exactly 1", () => {
    const modifier = makePollModifier(null);
    expect(modifier("anything")).toBe(1);
    expect(modifier("")).toBe(1);
  });
});
