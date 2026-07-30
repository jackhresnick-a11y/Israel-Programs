import { describe, it, expect } from "vitest";
import { computeMajority, hasReachedCoreMajority } from "./pollUnlock";

describe("computeMajority", () => {
  it("computes floor(n/2)+1 for a range of Core question counts", () => {
    // The task's own worked example: 8 Core questions -> majority of 5.
    expect(computeMajority(8)).toBe(5);
    expect(computeMajority(1)).toBe(1);
    expect(computeMajority(2)).toBe(2);
    expect(computeMajority(3)).toBe(2);
    expect(computeMajority(4)).toBe(3);
    expect(computeMajority(5)).toBe(3);
    expect(computeMajority(7)).toBe(4);
    expect(computeMajority(9)).toBe(5);
    expect(computeMajority(10)).toBe(6);
  });

  it("never requires more than the full count", () => {
    for (let n = 1; n <= 20; n++) {
      expect(computeMajority(n)).toBeLessThanOrEqual(n);
    }
  });
});

describe("hasReachedCoreMajority", () => {
  it("a program with zero Core questions can never be crossed", () => {
    expect(hasReachedCoreMajority([], new Set(), new Set())).toBe(false);
  });

  it("8 Core questions, exactly 5 answered -> crosses (the task's own example)", () => {
    const core = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];
    const answered = new Set(["q1", "q2", "q3", "q4", "q5"]);
    expect(hasReachedCoreMajority(core, answered, new Set())).toBe(true);
  });

  it("8 Core questions, only 4 answered -> does not cross", () => {
    const core = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];
    const answered = new Set(["q1", "q2", "q3", "q4"]);
    expect(hasReachedCoreMajority(core, answered, new Set())).toBe(false);
  });

  it("N/A counts the same as an answer toward the majority", () => {
    const core = ["q1", "q2", "q3"]; // majority = 2
    const answered = new Set(["q1"]);
    const na = new Set(["q2"]);
    expect(hasReachedCoreMajority(core, answered, na)).toBe(true);
  });

  it("a question that is neither answered nor N/A'd (a true skip) does not count", () => {
    const core = ["q1", "q2", "q3"]; // majority = 2
    const answered = new Set(["q1"]);
    const na = new Set<string>();
    expect(hasReachedCoreMajority(core, answered, na)).toBe(false);
  });

  it("answering a non-Core question never contributes toward the Core majority", () => {
    const core = ["q1", "q2", "q3"]; // majority = 2
    const answered = new Set(["extra_1", "extra_2", "extra_3"]); // none of these are Core
    expect(hasReachedCoreMajority(core, answered, new Set())).toBe(false);
  });

  it("single-question program: one answer is enough (majority of 1 is 1)", () => {
    expect(hasReachedCoreMajority(["only"], new Set(["only"]), new Set())).toBe(true);
    expect(hasReachedCoreMajority(["only"], new Set(), new Set())).toBe(false);
  });

  it("adding or removing a Core question changes the bar without any hardcoded number", () => {
    // Simulates an admin adding a 9th Core question by hand -- majority moves from 5 to 5
    // still (floor(9/2)+1 = 5), but 10 moves it to 6. Nothing here is cached/hardcoded --
    // callers always recompute from the live core id list length.
    const core9 = Array.from({ length: 9 }, (_, i) => `q${i}`);
    const core10 = Array.from({ length: 10 }, (_, i) => `q${i}`);
    const answeredFive = new Set(core9.slice(0, 5));
    expect(hasReachedCoreMajority(core9, answeredFive, new Set())).toBe(true);
    expect(hasReachedCoreMajority(core10, answeredFive, new Set())).toBe(false);
  });
});
