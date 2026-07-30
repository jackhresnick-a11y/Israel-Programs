import { describe, it, expect } from "vitest";
import {
  computeMajority,
  hasReachedCoreMajority,
  resolveHistoricalCoreQuestionIds,
  responseMeetsHistoricalMajority,
  type HistoricalCoreQuestion,
} from "./pollUnlock";

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

function q(id: string, createdAt: string, status: "ACTIVE" | "RETIRED" = "ACTIVE"): HistoricalCoreQuestion {
  return { id, createdAt: new Date(createdAt), status };
}

describe("resolveHistoricalCoreQuestionIds", () => {
  it("excludes a question created after the response", () => {
    const questions = [q("old", "2026-01-01"), q("new", "2026-06-01")];
    const responseCreatedAt = new Date("2026-03-01"); // before "new" existed
    expect(resolveHistoricalCoreQuestionIds(questions, responseCreatedAt)).toEqual(["old"]);
  });

  it("includes a question created before or exactly at the response's createdAt", () => {
    const questions = [q("old", "2026-01-01"), q("same-instant", "2026-03-01")];
    const responseCreatedAt = new Date("2026-03-01");
    expect(resolveHistoricalCoreQuestionIds(questions, responseCreatedAt)).toEqual(["old", "same-instant"]);
  });

  it("excludes a currently-retired question regardless of when it was created", () => {
    const questions = [q("old-active", "2026-01-01"), q("old-retired", "2026-01-01", "RETIRED")];
    const responseCreatedAt = new Date("2026-06-01"); // long after both existed
    expect(resolveHistoricalCoreQuestionIds(questions, responseCreatedAt)).toEqual(["old-active"]);
  });

  it("adding a new Core question never enlarges an older response's historical set", () => {
    // The task's own monotonicity requirement: a response created in March, evaluated
    // once against the June Core set (2 questions) and once against a hypothetical
    // September Core set (3 questions, one added in August) -- must get the SAME
    // historical set either way, since the September addition postdates the response.
    const juneSet = [q("a", "2026-01-01"), q("b", "2026-01-01")];
    const septemberSet = [...juneSet, q("c", "2026-08-01")];
    const marchResponse = new Date("2026-03-01");
    expect(resolveHistoricalCoreQuestionIds(juneSet, marchResponse)).toEqual(
      resolveHistoricalCoreQuestionIds(septemberSet, marchResponse)
    );
  });
});

describe("responseMeetsHistoricalMajority", () => {
  it("Yeshivat Har Etzion's own scenario: a response answered all questions live at its time, but a later-added question must not dilute it", () => {
    // 2 Core questions existed when this response was submitted; it answered both.
    // Later, a 3rd Core question is added (today). Historically this response only ever
    // had 2 questions to answer, majority of 2 -- both answered, so it still counts,
    // even though today's LIVE Core set is 3 (which would need majority of 2 anyway in
    // this specific case, but the point is the historical set, not today's, gates it).
    const questions = [q("a", "2026-01-01"), q("b", "2026-01-01"), q("c", "2026-08-01")];
    const responseCreatedAt = new Date("2026-02-01");
    const answered = new Set(["a", "b"]);
    expect(responseMeetsHistoricalMajority(questions, responseCreatedAt, answered, new Set())).toBe(true);
  });

  it("a response that answered only 1 of 2 historically-live questions does not meet majority", () => {
    const questions = [q("a", "2026-01-01"), q("b", "2026-01-01")];
    const responseCreatedAt = new Date("2026-02-01");
    const answered = new Set(["a"]);
    expect(responseMeetsHistoricalMajority(questions, responseCreatedAt, answered, new Set())).toBe(false);
  });

  it("a retired question is never part of the historical set even for a response old enough to have answered it", () => {
    const questions = [q("a", "2026-01-01"), q("b", "2026-01-01", "RETIRED")];
    const responseCreatedAt = new Date("2026-02-01");
    const answered = new Set(["a", "b"]); // answered both, but b no longer counts
    // Historical set is just ["a"], majority of 1 is 1, "a" answered -> true.
    expect(responseMeetsHistoricalMajority(questions, responseCreatedAt, answered, new Set())).toBe(true);
  });
});
