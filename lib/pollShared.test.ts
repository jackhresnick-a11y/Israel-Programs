import { describe, it, expect } from "vitest";
import { resolvePollQuestionSet, type PollBucketDTO, type PollQuestionDTO } from "./pollShared";

function question(id: string, overrides: Partial<PollQuestionDTO> = {}): PollQuestionDTO {
  return {
    id,
    key: id,
    text: `Question ${id}`,
    type: "STARS",
    labels: ["a", "b", "c", "d", "e"],
    dropdownOptions: null,
    version: 1,
    status: "ACTIVE",
    ...overrides,
  };
}

function bucket(id: string, overrides: Partial<PollBucketDTO> = {}): PollBucketDTO {
  return {
    id,
    name: id,
    description: null,
    questionIds: [],
    order: 0,
    isCore: false,
    status: "ACTIVE",
    ...overrides,
  };
}

const core = bucket("core", { isCore: true, questionIds: ["q1", "q2", "q3"] });
const questions = [question("q1"), question("q2"), question("q3"), question("q4"), question("q5")];

describe("resolvePollQuestionSet", () => {
  it("returns core questions in the core bucket's order by default", () => {
    const result = resolvePollQuestionSet(
      { bucketIds: [], addedQuestionIds: [], removedQuestionIds: [] },
      [core],
      questions
    );
    expect(result.core.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    expect(result.extras).toEqual([]);
  });

  it("drops an individually removed core question for this program", () => {
    const result = resolvePollQuestionSet(
      { bucketIds: [], addedQuestionIds: [], removedQuestionIds: ["q2"] },
      [core],
      questions
    );
    expect(result.core.map((q) => q.id)).toEqual(["q1", "q3"]);
  });

  it("appends per-program added questions after core, without duplicating a core id", () => {
    const result = resolvePollQuestionSet(
      { bucketIds: [], addedQuestionIds: ["q4", "q1"], removedQuestionIds: [] },
      [core],
      questions
    );
    expect(result.core.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
  });

  it("a removal wins over an addition for the same question id", () => {
    const result = resolvePollQuestionSet(
      { bucketIds: [], addedQuestionIds: ["q4"], removedQuestionIds: ["q4"] },
      [core],
      questions
    );
    expect(result.core.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
  });

  it("silently drops a retired question referenced by the core bucket", () => {
    const retiredQ2 = questions.map((q) => (q.id === "q2" ? { ...q, status: "RETIRED" as const } : q));
    const result = resolvePollQuestionSet(
      { bucketIds: [], addedQuestionIds: [], removedQuestionIds: [] },
      [core],
      retiredQ2
    );
    expect(result.core.map((q) => q.id)).toEqual(["q1", "q3"]);
  });

  it("silently drops a dead soft-ref id (question deleted, id still in questionIds)", () => {
    const coreWithDeadRef = bucket("core", { isCore: true, questionIds: ["q1", "ghost-id", "q3"] });
    const result = resolvePollQuestionSet(
      { bucketIds: [], addedQuestionIds: [], removedQuestionIds: [] },
      [coreWithDeadRef],
      questions
    );
    expect(result.core.map((q) => q.id)).toEqual(["q1", "q3"]);
  });

  it("includes extra buckets attached to the program, in config bucketIds order", () => {
    const extraA = bucket("extraA", { questionIds: ["q4"] });
    const extraB = bucket("extraB", { questionIds: ["q5"] });
    const result = resolvePollQuestionSet(
      { bucketIds: ["extraB", "extraA"], addedQuestionIds: [], removedQuestionIds: [] },
      [core, extraA, extraB],
      questions
    );
    expect(result.extras.map((e) => e.bucket.id)).toEqual(["extraB", "extraA"]);
    expect(result.extras[0].questions.map((q) => q.id)).toEqual(["q5"]);
    expect(result.extras[1].questions.map((q) => q.id)).toEqual(["q4"]);
  });

  it("never surfaces the core bucket as an extra, even if a config lists it in bucketIds", () => {
    const result = resolvePollQuestionSet(
      { bucketIds: ["core"], addedQuestionIds: [], removedQuestionIds: [] },
      [core],
      questions
    );
    expect(result.extras).toEqual([]);
  });

  it("drops a retired extra bucket entirely", () => {
    const retiredExtra = bucket("retired", { questionIds: ["q4"], status: "RETIRED" });
    const result = resolvePollQuestionSet(
      { bucketIds: ["retired"], addedQuestionIds: [], removedQuestionIds: [] },
      [core, retiredExtra],
      questions
    );
    expect(result.extras).toEqual([]);
  });

  it("drops a config bucketIds entry pointing at a bucket that no longer exists", () => {
    const result = resolvePollQuestionSet(
      { bucketIds: ["nonexistent"], addedQuestionIds: [], removedQuestionIds: [] },
      [core],
      questions
    );
    expect(result.extras).toEqual([]);
  });

  it("drops an extra bucket that ends up with zero resolvable questions", () => {
    const emptyExtra = bucket("empty", { questionIds: ["removed-q"] });
    const result = resolvePollQuestionSet(
      { bucketIds: ["empty"], addedQuestionIds: [], removedQuestionIds: ["removed-q"] },
      [core, emptyExtra],
      questions
    );
    expect(result.extras).toEqual([]);
  });

  it("returns no core questions when there is no core bucket at all (degrades, doesn't throw)", () => {
    const result = resolvePollQuestionSet(
      { bucketIds: [], addedQuestionIds: [], removedQuestionIds: [] },
      [],
      questions
    );
    expect(result.core).toEqual([]);
    expect(result.extras).toEqual([]);
  });
});
