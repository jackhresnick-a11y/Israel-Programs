import { describe, it, expect } from "vitest";
import { selectClip, isInRollout, type FlowVideoTriggerDTO } from "./flowClips";
import type { FlowAnswers } from "./flowShared";

function trigger(overrides: Partial<FlowVideoTriggerDTO> & Pick<FlowVideoTriggerDTO, "id" | "videoId" | "mode">): FlowVideoTriggerDTO {
  return {
    questionId: "q",
    optionKeys: [],
    when: null,
    rolloutPercent: 100,
    order: 0,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("selectClip", () => {
  const noAnswers: FlowAnswers = {};

  it("answer-trigger beats display-trigger", () => {
    const triggers = [
      trigger({ id: "t-display", videoId: "v-display", mode: "ON_DISPLAY" }),
      trigger({ id: "t-answer", videoId: "v-answer", mode: "ON_ANSWER", optionKeys: ["straight-in"] }),
    ];
    expect(selectClip(triggers, ["straight-in"], noAnswers, "session-1")).toBe("v-answer");
  });

  it("with no answer yet, only display triggers can fire", () => {
    const triggers = [
      trigger({ id: "t-display", videoId: "v-display", mode: "ON_DISPLAY" }),
      trigger({ id: "t-answer", videoId: "v-answer", mode: "ON_ANSWER", optionKeys: ["straight-in"] }),
    ];
    expect(selectClip(triggers, null, noAnswers, "session-1")).toBe("v-display");
    expect(selectClip(triggers, [], noAnswers, "session-1")).toBe("v-display");
  });

  it("revising the answer swaps the clip", () => {
    const triggers = [
      trigger({ id: "t1", videoId: "v-straight-in", mode: "ON_ANSWER", optionKeys: ["straight-in"] }),
      trigger({ id: "t2", videoId: "v-two-years", mode: "ON_ANSWER", optionKeys: ["two-years"] }),
    ];
    expect(selectClip(triggers, ["straight-in"], noAnswers, "session-1")).toBe("v-straight-in");
    expect(selectClip(triggers, ["two-years"], noAnswers, "session-1")).toBe("v-two-years");
  });

  it("revising to an untriggered option falls back to a qualifying display clip, or null", () => {
    const withFallback = [
      trigger({ id: "t1", videoId: "v-straight-in", mode: "ON_ANSWER", optionKeys: ["straight-in"] }),
      trigger({ id: "t2", videoId: "v-fallback", mode: "ON_DISPLAY" }),
    ];
    expect(selectClip(withFallback, ["not-sure"], noAnswers, "session-1")).toBe("v-fallback");

    const withoutFallback = [trigger({ id: "t1", videoId: "v-straight-in", mode: "ON_ANSWER", optionKeys: ["straight-in"] })];
    expect(selectClip(withoutFallback, ["not-sure"], noAnswers, "session-1")).toBeNull();
  });

  it("one clip fired by two different answers (Q7's last-two-options case)", () => {
    const triggers = [
      trigger({ id: "t1", videoId: "v-not-a-learner", mode: "ON_ANSWER", optionKeys: ["school-killed-it", "never-tried"] }),
    ];
    expect(selectClip(triggers, ["school-killed-it"], noAnswers, "session-1")).toBe("v-not-a-learner");
    expect(selectClip(triggers, ["never-tried"], noAnswers, "session-1")).toBe("v-not-a-learner");
    expect(selectClip(triggers, ["i-love-it"], noAnswers, "session-1")).toBeNull();
  });

  it("two triggers competing for the same slot resolve deterministically by order then id", () => {
    const byOrder = [
      trigger({ id: "z", videoId: "v-second", mode: "ON_DISPLAY", order: 1 }),
      trigger({ id: "a", videoId: "v-first", mode: "ON_DISPLAY", order: 0 }),
    ];
    expect(selectClip(byOrder, null, noAnswers, "session-1")).toBe("v-first");

    const byIdTiebreak = [
      trigger({ id: "z-trigger", videoId: "v-z", mode: "ON_DISPLAY", order: 0 }),
      trigger({ id: "a-trigger", videoId: "v-a", mode: "ON_DISPLAY", order: 0 }),
    ];
    expect(selectClip(byIdTiebreak, null, noAnswers, "session-1")).toBe("v-a");
  });

  it("RETIRED triggers never fire", () => {
    const triggers = [trigger({ id: "t1", videoId: "v1", mode: "ON_DISPLAY", status: "RETIRED" })];
    expect(selectClip(triggers, null, noAnswers, "session-1")).toBeNull();
  });

  it("Q6's split: a trigger's own `when` gates it independently of the question's own answer", () => {
    // Two ON_DISPLAY triggers on the same question, split by a DIFFERENT question's
    // (program-gender) answer -- the taxonomy clip for single-gender paths, the
    // mechina-split clip for everyone else.
    const triggers = [
      trigger({
        id: "taxonomy",
        videoId: "v-taxonomy",
        mode: "ON_DISPLAY",
        when: { v: 1, when: { type: "answerIn", questionKey: "program-gender", optionKeys: ["boys-only", "girls-only"] } },
      }),
      trigger({
        id: "mechina-split",
        videoId: "v-mechina-split",
        mode: "ON_DISPLAY",
        when: {
          v: 1,
          when: { type: "not", of: { type: "answerIn", questionKey: "program-gender", optionKeys: ["boys-only", "girls-only"] } },
        },
      }),
    ];
    expect(selectClip(triggers, null, { "program-gender": ["boys-only"] }, "session-1")).toBe("v-taxonomy");
    expect(selectClip(triggers, null, { "program-gender": ["mixed"] }, "session-1")).toBe("v-mechina-split");
    expect(selectClip(triggers, null, {}, "session-1")).toBe("v-mechina-split"); // skipped gender -> not(answerIn) is true
  });

  it("an unparseable trigger `when` fails open (fires), never silently suppressed", () => {
    const triggers = [trigger({ id: "t1", videoId: "v1", mode: "ON_DISPLAY", when: { garbage: true } })];
    expect(selectClip(triggers, null, noAnswers, "session-1")).toBe("v1");
  });

  it("no triggers at all resolves to null", () => {
    expect(selectClip([], null, noAnswers, "session-1")).toBeNull();
  });
});

describe("isInRollout", () => {
  it("100 (default) always fires, 0 never fires", () => {
    expect(isInRollout("session-1", "trigger-1", 100)).toBe(true);
    expect(isInRollout("session-1", "trigger-1", 0)).toBe(false);
  });

  it("is stable across repeated calls for the same session+trigger pair", () => {
    const first = isInRollout("session-abc", "trigger-xyz", 50);
    for (let i = 0; i < 20; i++) {
      expect(isInRollout("session-abc", "trigger-xyz", 50)).toBe(first);
    }
  });

  it("spreads roughly evenly across many sessions at 50%", () => {
    let included = 0;
    const n = 500;
    for (let i = 0; i < n; i++) {
      if (isInRollout(`session-${i}`, "trigger-fixed", 50)) included++;
    }
    // Not a precise statistical assertion -- just guards against a degenerate hash
    // that always returns true/false or clusters wildly.
    expect(included).toBeGreaterThan(n * 0.3);
    expect(included).toBeLessThan(n * 0.7);
  });
});
