import { describe, it, expect } from "vitest";
import {
  maxResponsesInWindow,
  computeClusterSignal,
  isClustered,
  CLUSTER_BURST_WINDOW_MS,
  type ClusterResponseInput,
} from "./pollClustering";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const BASE = Date.parse("2026-01-01T00:00:00.000Z");

function at(offsetMs: number, yearAttended: number | null = null): ClusterResponseInput {
  return { createdAt: new Date(BASE + offsetMs), yearAttended };
}

describe("maxResponsesInWindow", () => {
  it("empty input -> 0", () => {
    expect(maxResponsesInWindow([], DAY)).toBe(0);
  });

  it("finds the densest window regardless of input order", () => {
    const sorted = [0, HOUR, 2 * HOUR, 40 * DAY];
    const shuffled = [40 * DAY, 0, 2 * HOUR, HOUR];
    expect(maxResponsesInWindow(sorted, DAY)).toBe(3);
    expect(maxResponsesInWindow(shuffled, DAY)).toBe(3);
  });

  it("timestamps exactly windowMs apart are inclusive (same window)", () => {
    expect(maxResponsesInWindow([0, DAY], DAY)).toBe(2);
    expect(maxResponsesInWindow([0, DAY + 1], DAY)).toBe(1);
  });
});

describe("computeClusterSignal", () => {
  it("empty input", () => {
    const signal = computeClusterSignal([]);
    expect(signal).toEqual({
      burst: false,
      maxInWindow: 0,
      cohort: false,
      dominantYear: null,
      dominantYearCount: 0,
      knownYearCount: 0,
      total: 0,
    });
  });

  it("3 responses in one minute -> below CLUSTER_MIN_RESPONSES, not burst", () => {
    const responses = [at(0), at(30_000), at(60_000)];
    const signal = computeClusterSignal(responses);
    expect(signal.burst).toBe(false);
    expect(signal.maxInWindow).toBe(3);
  });

  it("5 of 6 within 2 hours, 1 a month later -> burst", () => {
    const responses = [at(0), at(HOUR), at(1.5 * HOUR), at(1.8 * HOUR), at(2 * HOUR), at(30 * DAY)];
    const signal = computeClusterSignal(responses);
    expect(signal.burst).toBe(true);
    expect(signal.maxInWindow).toBe(5);
  });

  it("6 responses one per week -> not burst", () => {
    const responses = Array.from({ length: 6 }, (_, i) => at(i * WEEK));
    const signal = computeClusterSignal(responses);
    expect(signal.burst).toBe(false);
    expect(signal.maxInWindow).toBe(1);
  });

  it("boundary: timestamps exactly CLUSTER_BURST_WINDOW_MS apart count as one window", () => {
    // 0 and CLUSTER_BURST_WINDOW_MS are exactly one window apart (inclusive -> counts as
    // 2 together); the response after that is a further CLUSTER_BURST_WINDOW_MS away, so
    // it falls in the next window, not a single 4-wide one.
    const responses = [at(0), at(CLUSTER_BURST_WINDOW_MS), at(2 * CLUSTER_BURST_WINDOW_MS), at(3 * CLUSTER_BURST_WINDOW_MS)];
    const signal = computeClusterSignal(responses);
    expect(signal.maxInWindow).toBe(2);
    expect(signal.burst).toBe(false);
  });

  it("unsorted input produces the identical result to sorted input", () => {
    const sorted = [at(0), at(HOUR), at(2 * HOUR), at(30 * DAY), at(31 * DAY), at(32 * DAY)];
    const shuffled = [sorted[3], sorted[0], sorted[5], sorted[1], sorted[4], sorted[2]];
    expect(computeClusterSignal(shuffled)).toEqual(computeClusterSignal(sorted));
  });

  it("5 of 6 same year, spread over weeks -> cohort", () => {
    const responses = [
      at(0 * WEEK, 2025),
      at(1 * WEEK, 2025),
      at(2 * WEEK, 2025),
      at(3 * WEEK, 2025),
      at(4 * WEEK, 2025),
      at(5 * WEEK, 2023),
    ];
    const signal = computeClusterSignal(responses);
    expect(signal.cohort).toBe(true);
    expect(signal.dominantYear).toBe(2025);
    expect(signal.dominantYearCount).toBe(5);
    expect(signal.knownYearCount).toBe(6);
  });

  it("all null years -> not cohort, no dominant year", () => {
    const responses = Array.from({ length: 6 }, (_, i) => at(i * WEEK, null));
    const signal = computeClusterSignal(responses);
    expect(signal.cohort).toBe(false);
    expect(signal.knownYearCount).toBe(0);
    expect(signal.dominantYear).toBeNull();
  });

  it("4 known of 30 total, all same year -> not cohort (known/total below 0.5)", () => {
    const responses = [
      ...Array.from({ length: 4 }, (_, i) => at(i * WEEK, 2024)),
      ...Array.from({ length: 26 }, (_, i) => at((i + 4) * WEEK, null)),
    ];
    const signal = computeClusterSignal(responses);
    expect(signal.knownYearCount).toBe(4);
    expect(signal.cohort).toBe(false);
  });

  it("yearAttended 0 (the 'Earlier' sentinel) counts as a real cohort value, not null", () => {
    const responses = [
      at(0 * WEEK, 0),
      at(1 * WEEK, 0),
      at(2 * WEEK, 0),
      at(3 * WEEK, 0),
      at(4 * WEEK, 0),
      at(5 * WEEK, 2020),
    ];
    const signal = computeClusterSignal(responses);
    expect(signal.cohort).toBe(true);
    expect(signal.dominantYear).toBe(0);
    expect(signal.dominantYearCount).toBe(5);
  });

  it("dominance boundary: 7 of 10 known -> cohort true, 6 of 10 -> cohort false", () => {
    const seven = [
      ...Array.from({ length: 7 }, (_, i) => at(i * WEEK, 2025)),
      ...Array.from({ length: 3 }, (_, i) => at((i + 7) * WEEK, 2019)),
    ];
    const six = [
      ...Array.from({ length: 6 }, (_, i) => at(i * WEEK, 2025)),
      ...Array.from({ length: 4 }, (_, i) => at((i + 6) * WEEK, 2019)),
    ];
    expect(computeClusterSignal(seven).cohort).toBe(true);
    expect(computeClusterSignal(six).cohort).toBe(false);
  });
});

describe("isClustered", () => {
  const base = { maxInWindow: 0, dominantYear: null, dominantYearCount: 0, knownYearCount: 0, total: 10 };

  it("true when burst only", () => {
    expect(isClustered({ ...base, burst: true, cohort: false })).toBe(true);
  });

  it("true when cohort only", () => {
    expect(isClustered({ ...base, burst: false, cohort: true })).toBe(true);
  });

  it("true when both", () => {
    expect(isClustered({ ...base, burst: true, cohort: true })).toBe(true);
  });

  it("false when neither", () => {
    expect(isClustered({ ...base, burst: false, cohort: false })).toBe(false);
  });
});
