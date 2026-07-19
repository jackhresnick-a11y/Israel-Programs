import { describe, it, expect } from "vitest";
import {
  resolvePollQuestionSet,
  signedInSubmitSchema,
  anonymousSubmitSchema,
  detailsSubmitSchema,
  reviewInputSchema,
  type PollBucketDTO,
  type PollQuestionDTO,
} from "./pollShared";

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

describe("reviewInputSchema: consent must be the literal true", () => {
  it("accepts a review with consent: true", () => {
    const result = reviewInputSchema.safeParse({ questionId: "q1", text: "Great program", consent: true });
    expect(result.success).toBe(true);
  });

  it("rejects consent: false -- an unconsented review is never sent, not sent-and-flagged", () => {
    const result = reviewInputSchema.safeParse({ questionId: "q1", text: "Great program", consent: false });
    expect(result.success).toBe(false);
  });

  it("rejects empty text", () => {
    const result = reviewInputSchema.safeParse({ questionId: "q1", text: "", consent: true });
    expect(result.success).toBe(false);
  });

  it("rejects text over 1000 characters", () => {
    const result = reviewInputSchema.safeParse({ questionId: "q1", text: "a".repeat(1001), consent: true });
    expect(result.success).toBe(false);
  });
});

describe("signedInSubmitSchema / anonymousSubmitSchema: skip and empty-submission rules", () => {
  it("accepts a partial submission -- some questions answered, the rest implicitly skipped", () => {
    const result = signedInSubmitSchema.safeParse({
      programId: "p1",
      answers: [{ questionId: "q1", value: 4 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero answers plus a consented review -- reviews alone are a valid submission", () => {
    const result = signedInSubmitSchema.safeParse({
      programId: "p1",
      answers: [],
      reviews: [{ questionId: "q1", text: "Loved it", consent: true }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero answers with no reviews field at all -- reviews defaults to [], still empty", () => {
    const result = signedInSubmitSchema.safeParse({ programId: "p1", answers: [] });
    expect(result.success).toBe(false);
  });

  it("rejects zero answers AND an explicit empty reviews array -- nothing at all is not a response", () => {
    const result = signedInSubmitSchema.safeParse({ programId: "p1", answers: [], reviews: [] });
    expect(result.success).toBe(false);
  });

  it("anonymousSubmitSchema applies the same empty-submission rule", () => {
    const result = anonymousSubmitSchema.safeParse({ programId: "p1", answers: [], reviews: [] });
    expect(result.success).toBe(false);
  });

  it("anonymousSubmitSchema still requires a real 1-5 value for any answer that IS present -- a skip is absence, never a null/out-of-range value", () => {
    const result = anonymousSubmitSchema.safeParse({
      programId: "p1",
      answers: [{ questionId: "q1", value: 6 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("naQuestionIds: N/A marks", () => {
  it("defaults naQuestionIds to [] when omitted", () => {
    const result = signedInSubmitSchema.safeParse({
      programId: "p1",
      answers: [{ questionId: "q1", value: 4 }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.naQuestionIds).toEqual([]);
  });

  it("accepts an answer for one question and an N/A mark for another", () => {
    const result = signedInSubmitSchema.safeParse({
      programId: "p1",
      answers: [{ questionId: "q1", value: 4 }],
      naQuestionIds: ["q2"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a question that is both answered and marked N/A", () => {
    const result = signedInSubmitSchema.safeParse({
      programId: "p1",
      answers: [{ questionId: "q1", value: 4 }],
      naQuestionIds: ["q1"],
    });
    expect(result.success).toBe(false);
  });

  it("anonymousSubmitSchema rejects the same answer/N/A overlap", () => {
    const result = anonymousSubmitSchema.safeParse({
      programId: "p1",
      answers: [{ questionId: "q1", value: 4 }],
      naQuestionIds: ["q1"],
    });
    expect(result.success).toBe(false);
  });

  it("an all-N/A submission with no answers and no reviews still fails the empty-submission rule -- N/A marks alone aren't content", () => {
    const result = signedInSubmitSchema.safeParse({
      programId: "p1",
      answers: [],
      naQuestionIds: ["q1", "q2"],
    });
    expect(result.success).toBe(false);
  });

  it("detailsSubmitSchema accepts N/A-only detail (no answers, no reviews) -- unlike the initial submit, an empty-content detail save is a legitimate no-op-except-N/A", () => {
    const result = detailsSubmitSchema.safeParse({
      answers: [],
      naQuestionIds: ["q4"],
    });
    expect(result.success).toBe(true);
  });

  it("detailsSubmitSchema rejects an overlapping answer/N/A pair too", () => {
    const result = detailsSubmitSchema.safeParse({
      answers: [{ questionId: "q4", value: 3 }],
      naQuestionIds: ["q4"],
    });
    expect(result.success).toBe(false);
  });
});
