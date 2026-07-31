import { describe, it, expect } from "vitest";
import {
  hasReachedBucketSpread,
  resolveHistoricalBucketGroups,
  responseMeetsHistoricalSpread,
  type HistoricalQuestion,
} from "./pollUnlock";

describe("hasReachedBucketSpread", () => {
  it("a program with zero served buckets can never be crossed", () => {
    expect(hasReachedBucketSpread([], new Set(), new Set())).toBe(false);
    expect(hasReachedBucketSpread([[], []], new Set(), new Set())).toBe(false);
  });

  it("every bucket covered plus floor of 3 total -> crosses", () => {
    const groups = [
      ["g1", "g2", "g3"], // Core
      ["s1", "s2"], // Social Life
      ["h1"], // Hebrew Learning
    ];
    const answered = new Set(["g1", "s1", "h1"]);
    expect(hasReachedBucketSpread(groups, answered, new Set())).toBe(true);
  });

  it("every bucket covered but fewer than 3 total -> does not cross (floor of 3)", () => {
    const groups = [["g1", "g2"], ["s1"]];
    const answered = new Set(["g1", "s1"]); // 2 total, both groups covered
    expect(hasReachedBucketSpread(groups, answered, new Set())).toBe(false);
  });

  it("3+ total answers but one served bucket untouched -> does not cross", () => {
    const groups = [
      ["g1", "g2", "g3"], // Core -- 3 answered here
      ["s1", "s2"], // Social Life -- untouched
    ];
    const answered = new Set(["g1", "g2", "g3"]);
    expect(hasReachedBucketSpread(groups, answered, new Set())).toBe(false);
  });

  it("N/A counts the same as an answer toward both per-group coverage and the floor", () => {
    const groups = [["g1"], ["s1"], ["h1"]];
    const na = new Set(["g1", "s1", "h1"]);
    expect(hasReachedBucketSpread(groups, new Set(), na)).toBe(true);
  });

  it("a question that is neither answered nor N/A'd (a true skip) does not count", () => {
    const groups = [["g1", "g2"], ["s1"]];
    const answered = new Set(["g1"]);
    expect(hasReachedBucketSpread(groups, answered, new Set())).toBe(false);
  });

  it("an empty served group (a bucket resolved to zero questions) is ignored, not impossible", () => {
    const groups = [["g1", "g2", "g3"], []];
    const answered = new Set(["g1", "g2", "g3"]);
    expect(hasReachedBucketSpread(groups, answered, new Set())).toBe(true);
  });

  it("single-bucket program still needs the floor of 3, not just 1", () => {
    const groups = [["g1", "g2", "g3", "g4"]];
    expect(hasReachedBucketSpread(groups, new Set(["g1"]), new Set())).toBe(false);
    expect(hasReachedBucketSpread(groups, new Set(["g1", "g2"]), new Set())).toBe(false);
    expect(hasReachedBucketSpread(groups, new Set(["g1", "g2", "g3"]), new Set())).toBe(true);
  });

  it("answering a question outside every served group never contributes", () => {
    const groups = [["g1", "g2"], ["s1"]];
    const answered = new Set(["stray_1", "stray_2", "stray_3"]);
    expect(hasReachedBucketSpread(groups, answered, new Set())).toBe(false);
  });
});

function hq(id: string, status: "ACTIVE" | "RETIRED" = "ACTIVE"): [string, HistoricalQuestion] {
  return [id, { id, status }];
}

describe("resolveHistoricalBucketGroups", () => {
  it("filters each group down to questions that were both presented and are still ACTIVE", () => {
    const groups = [["g1", "g2", "g3"], ["s1", "s2"]];
    const presented = ["g1", "g2", "s1"]; // g3/s2 never shown to this respondent
    const questionsById = new Map([hq("g1"), hq("g2"), hq("g3"), hq("s1"), hq("s2")]);
    expect(resolveHistoricalBucketGroups(groups, presented, questionsById)).toEqual([["g1", "g2"], ["s1"]]);
  });

  it("drops a since-retired question even if it was presented at the time", () => {
    const groups = [["g1", "g2"]];
    const presented = ["g1", "g2"];
    const questionsById = new Map([hq("g1"), hq("g2", "RETIRED")]);
    expect(resolveHistoricalBucketGroups(groups, presented, questionsById)).toEqual([["g1"]]);
  });

  it("a bucket with nothing presented becomes an empty group, not an impossible one", () => {
    const groups = [["g1"], ["s1", "s2"]];
    const presented = ["g1"]; // this respondent's snapshot never included the extra bucket
    const questionsById = new Map([hq("g1"), hq("s1"), hq("s2")]);
    expect(resolveHistoricalBucketGroups(groups, presented, questionsById)).toEqual([["g1"], []]);
  });
});

describe("responseMeetsHistoricalSpread", () => {
  it("a response that covered every bucket it was actually served, floor of 3, meets the bar", () => {
    const groups = [["g1", "g2", "g3"], ["s1", "s2"]];
    const presented = ["g1", "g2", "s1"];
    const questionsById = new Map([hq("g1"), hq("g2"), hq("g3"), hq("s1"), hq("s2")]);
    const answered = new Set(["g1", "s1"]);
    const na = new Set(["g2"]);
    expect(responseMeetsHistoricalSpread(groups, presented, questionsById, answered, na)).toBe(true);
  });

  it("a later-added bucket that was never presented to this response cannot retroactively fail it", () => {
    // Today's live resolution includes a 3rd group the response was never shown --
    // resolveHistoricalBucketGroups reduces it to an empty (ignored) group, not a
    // requirement this old response could never have met.
    const groups = [["g1", "g2", "g3"], ["s1"], ["a1", "a2"]]; // "a" bucket added after
    const presented = ["g1", "g2", "g3", "s1"];
    const questionsById = new Map([hq("g1"), hq("g2"), hq("g3"), hq("s1"), hq("a1"), hq("a2")]);
    const answered = new Set(["g1", "g2", "s1"]);
    expect(responseMeetsHistoricalSpread(groups, presented, questionsById, answered, new Set())).toBe(true);
  });

  it("a retired question is never part of the historical set even if this response answered it", () => {
    const groups = [["g1", "g2"]];
    const presented = ["g1", "g2"];
    const questionsById = new Map([hq("g1"), hq("g2", "RETIRED")]);
    const answered = new Set(["g1", "g2"]);
    // Historical group is just ["g1"] once "g2" is filtered out -- 1 total answered,
    // below the floor of 3, so it no longer meets the bar even though it "answered
    // everything" at the time.
    expect(responseMeetsHistoricalSpread(groups, presented, questionsById, answered, new Set())).toBe(false);
  });
});
