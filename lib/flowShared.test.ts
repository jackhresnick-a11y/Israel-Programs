import { describe, it, expect } from "vitest";
import {
  evaluateFlowCondition,
  shouldShowQuestion,
  referencedQuestionKeys,
  resolveOptionSetKey,
  optionsForSet,
  parseAnswerState,
  serializeAnswerState,
  withAnswer,
  toConditionAnswers,
  resolveFlow,
  buildMatchHref,
  answerStateToRecord,
  recordToAnswerState,
  applyOptionOverrides,
  type FlowConditionNode,
  type FlowQuestionDTO,
  type FlowOptionDTO,
  type FlowAnswerState,
  type CoverageEliminator,
  type OptionCoverageCounter,
} from "./flowShared";

function option(overrides: Partial<FlowOptionDTO> & Pick<FlowOptionDTO, "key" | "label">): FlowOptionDTO {
  return {
    id: overrides.key,
    questionId: "q",
    rationale: null,
    order: 0,
    optionSetKeys: [],
    tagSlugs: [],
    durationValues: [],
    matchMode: "WEIGHT",
    weight: 1,
    requireIncludesUntagged: true,
    status: "ACTIVE",
    ...overrides,
  };
}

function question(
  overrides: Partial<FlowQuestionDTO> & Pick<FlowQuestionDTO, "key" | "order">
): FlowQuestionDTO {
  return {
    id: overrides.key,
    type: "CHALLENGE",
    prompt: `Question ${overrides.key}`,
    helpText: null,
    skippable: true,
    showWhen: null,
    optionSetRules: null,
    defaultOptionSetKey: null,
    version: 1,
    status: "ACTIVE",
    options: [],
    ...overrides,
  };
}

describe("evaluateFlowCondition", () => {
  it("answerIn is set-intersection, not equality", () => {
    const node: FlowConditionNode = { type: "answerIn", questionKey: "life-stage", optionKeys: ["a", "b"] };
    expect(evaluateFlowCondition(node, { "life-stage": ["b"] })).toBe(true);
    expect(evaluateFlowCondition(node, { "life-stage": ["c"] })).toBe(false);
  });

  it("a skipped or unanswered question makes answerIn false, always", () => {
    const node: FlowConditionNode = { type: "answerIn", questionKey: "life-stage", optionKeys: ["a"] };
    expect(evaluateFlowCondition(node, {})).toBe(false); // never reached
    expect(evaluateFlowCondition(node, { "life-stage": [] })).toBe(false); // explicit skip, empty array
  });

  it("answered is true only when the question has a real selection", () => {
    const node: FlowConditionNode = { type: "answered", questionKey: "life-stage" };
    expect(evaluateFlowCondition(node, {})).toBe(false);
    expect(evaluateFlowCondition(node, { "life-stage": [] })).toBe(false);
    expect(evaluateFlowCondition(node, { "life-stage": ["a"] })).toBe(true);
  });

  it("not(answerIn(unanswered)) is true -- this is why `answered` must exist as its own leaf", () => {
    const node: FlowConditionNode = {
      type: "not",
      of: { type: "answerIn", questionKey: "life-stage", optionKeys: ["a"] },
    };
    expect(evaluateFlowCondition(node, {})).toBe(true);
  });

  it("all/any combine as AND/OR", () => {
    const all: FlowConditionNode = {
      type: "all",
      of: [
        { type: "answerIn", questionKey: "a", optionKeys: ["x"] },
        { type: "answerIn", questionKey: "b", optionKeys: ["y"] },
      ],
    };
    expect(evaluateFlowCondition(all, { a: ["x"], b: ["y"] })).toBe(true);
    expect(evaluateFlowCondition(all, { a: ["x"], b: ["z"] })).toBe(false);

    const any: FlowConditionNode = {
      type: "any",
      of: [
        { type: "answerIn", questionKey: "a", optionKeys: ["x"] },
        { type: "answerIn", questionKey: "b", optionKeys: ["y"] },
      ],
    };
    expect(evaluateFlowCondition(any, { a: ["x"], b: ["z"] })).toBe(true);
    expect(evaluateFlowCondition(any, { a: ["q"], b: ["z"] })).toBe(false);
  });

  it("the sherut-leumi headroom shape (all + not) evaluates correctly", () => {
    const node: FlowConditionNode = {
      type: "all",
      of: [
        { type: "answerIn", questionKey: "service-intent", optionKeys: ["sherut-leumi"] },
        { type: "not", of: { type: "answerIn", questionKey: "life-stage", optionKeys: ["still-in-hs"] } },
      ],
    };
    expect(evaluateFlowCondition(node, { "service-intent": ["sherut-leumi"], "life-stage": ["working"] })).toBe(true);
    expect(
      evaluateFlowCondition(node, { "service-intent": ["sherut-leumi"], "life-stage": ["still-in-hs"] })
    ).toBe(false);
  });
});

describe("shouldShowQuestion", () => {
  it("null showWhen always shows", () => {
    expect(shouldShowQuestion(null, {})).toBe(true);
  });

  it("an unparseable rule fails OPEN -- the question is shown, never silently dropped", () => {
    expect(shouldShowQuestion({ garbage: true }, {})).toBe(true);
    expect(shouldShowQuestion("not even an object", {})).toBe(true);
    expect(shouldShowQuestion(42, {})).toBe(true);
  });

  it("the five spec conditions evaluate correctly", () => {
    const openerCondition = {
      v: 1,
      when: {
        type: "answerIn",
        questionKey: "life-stage",
        optionKeys: ["right-after-hs", "after-college", "working"],
      },
    };
    expect(shouldShowQuestion(openerCondition, { "life-stage": ["right-after-hs"] })).toBe(true);
    expect(shouldShowQuestion(openerCondition, { "life-stage": ["still-in-hs"] })).toBe(false);
    expect(shouldShowQuestion(openerCondition, {})).toBe(false); // unanswered life-stage
  });
});

describe("referencedQuestionKeys", () => {
  it("collects every question key a rule depends on, including nested", () => {
    const node: FlowConditionNode = {
      type: "all",
      of: [
        { type: "answerIn", questionKey: "a", optionKeys: ["x"] },
        { type: "not", of: { type: "answered", questionKey: "b" } },
      ],
    };
    expect(referencedQuestionKeys(node).sort()).toEqual(["a", "b"]);
  });
});

describe("resolveOptionSetKey / optionsForSet (Q6's three sets)", () => {
  const q6Rules = {
    v: 1,
    default: "mixed",
    rules: [
      { optionSetKey: "boys", when: { type: "answerIn", questionKey: "program-gender", optionKeys: ["boys-only"] } },
      { optionSetKey: "girls", when: { type: "answerIn", questionKey: "program-gender", optionKeys: ["girls-only"] } },
    ],
  };

  it("boys-only resolves to the boys set", () => {
    expect(resolveOptionSetKey(q6Rules, "mixed", { "program-gender": ["boys-only"] })).toBe("boys");
  });

  it("girls-only resolves to the girls set", () => {
    expect(resolveOptionSetKey(q6Rules, "mixed", { "program-gender": ["girls-only"] })).toBe("girls");
  });

  it("mixed and no-preference both fall through to the default", () => {
    expect(resolveOptionSetKey(q6Rules, "mixed", { "program-gender": ["mixed"] })).toBe("mixed");
    expect(resolveOptionSetKey(q6Rules, "mixed", { "program-gender": ["no-preference"] })).toBe("mixed");
  });

  it("a SKIPPED gender question also falls through to the default -- never an empty question", () => {
    expect(resolveOptionSetKey(q6Rules, "mixed", {})).toBe("mixed");
  });

  it("optionsForSet includes universal (empty optionSetKeys) options in every set", () => {
    const options = [
      option({ key: "israeli-yeshiva", label: "Israeli yeshiva", optionSetKeys: ["boys"] }),
      option({ key: "israeli-midrasha", label: "Israeli midrasha", optionSetKeys: ["girls"] }),
      option({ key: "religious-mechina", label: "Religious mechina", optionSetKeys: [] }),
    ];
    expect(optionsForSet(options, "boys").map((o) => o.key)).toEqual(["israeli-yeshiva", "religious-mechina"]);
    expect(optionsForSet(options, "girls").map((o) => o.key)).toEqual(["israeli-midrasha", "religious-mechina"]);
    expect(optionsForSet(options, "mixed").map((o) => o.key)).toEqual(["religious-mechina"]);
  });
});

describe("parseAnswerState / serializeAnswerState", () => {
  it("round-trips a mix of answers and skips", () => {
    const state: FlowAnswerState = new Map([
      ["life-stage", ["right-after-hs"]],
      ["service-intent", null],
    ]);
    const serialized = serializeAnswerState(state);
    expect(serialized).toBe("life-stage:right-after-hs,service-intent:-");
    const reparsed = parseAnswerState(serialized);
    expect(reparsed.get("life-stage")).toEqual(["right-after-hs"]);
    expect(reparsed.get("service-intent")).toBeNull();
  });

  it("empty/absent param parses to an empty map", () => {
    expect(parseAnswerState(null).size).toBe(0);
    expect(parseAnswerState(undefined).size).toBe(0);
    expect(parseAnswerState("").size).toBe(0);
  });

  it("round-trips an ACKNOWLEDGED interstitial (empty array) distinctly from a skip (null)", () => {
    // A naive serializer that drops empty arrays would silently un-acknowledge an
    // interstitial the moment its URL round-trips -- this is the regression guard.
    const state: FlowAnswerState = new Map([
      ["opener", []],
      ["service-intent", null],
    ]);
    const serialized = serializeAnswerState(state);
    expect(serialized).toBe("opener:_,service-intent:-");
    const reparsed = parseAnswerState(serialized);
    expect(reparsed.get("opener")).toEqual([]);
    expect(reparsed.has("opener")).toBe(true); // present (answered), not absent
    expect(reparsed.get("service-intent")).toBeNull();
  });

  it("drops a malformed entry rather than throwing", () => {
    const state = parseAnswerState("life-stage:right-after-hs,garbage,:empty-key,another:");
    expect(state.get("life-stage")).toEqual(["right-after-hs"]);
    expect(state.size).toBe(1);
  });

  it("withAnswer immutably updates state", () => {
    const original: FlowAnswerState = new Map([["a", ["x"]]]);
    const updated = withAnswer(original, "b", ["y"]);
    expect(original.has("b")).toBe(false); // original untouched
    expect(updated.get("a")).toEqual(["x"]);
    expect(updated.get("b")).toEqual(["y"]);
  });

  it("toConditionAnswers projects skip/absent down to simply absent", () => {
    const state: FlowAnswerState = new Map([
      ["a", ["x"]],
      ["b", null],
    ]);
    expect(toConditionAnswers(state)).toEqual({ a: ["x"] });
  });
});

describe("resolveFlow", () => {
  const q1 = question({
    key: "life-stage",
    order: 0,
    options: [option({ key: "still-in-hs", label: "Still in high school" }), option({ key: "working", label: "Working" })],
  });
  const q2Opener = question({
    key: "opener",
    order: 1,
    options: [],
    showWhen: { v: 1, when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] } },
  });
  const q3 = question({
    key: "program-gender",
    order: 2,
    options: [option({ key: "boys-only", label: "Boys only" }), option({ key: "mixed", label: "Mixed" })],
  });
  const q4 = question({
    key: "service-intent",
    order: 3,
    showWhen: { v: 1, when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] } },
    options: [option({ key: "army", label: "Army" }), option({ key: "not-planning", label: "Not planning to" })],
  });
  const q5 = question({
    key: "service-timing",
    order: 4,
    showWhen: { v: 1, when: { type: "answerIn", questionKey: "service-intent", optionKeys: ["army", "unsure"] } },
    options: [option({ key: "straight-in", label: "Straight in" })],
  });
  const questions = [q1, q2Opener, q3, q4, q5];

  it("shows every question a chain of passing conditions allows", () => {
    // life-stage=working shows the opener + service-intent; service-intent is not yet
    // answered, so service-timing (which depends on it) isn't visible yet.
    const state: FlowAnswerState = new Map([["life-stage", ["working"]]]);
    const { visible } = resolveFlow(questions, state, null);
    expect(visible.map((q) => q.key)).toEqual(["life-stage", "opener", "program-gender", "service-intent"]);
  });

  it("a hidden question's answer is pruned from state", () => {
    // life-stage = still-in-hs hides opener AND service-intent (and transitively service-timing)
    const state: FlowAnswerState = new Map([
      ["life-stage", ["still-in-hs"]],
      ["service-intent", ["army"]], // stranded: service-intent is no longer visible
    ]);
    const { visible, state: pruned } = resolveFlow(questions, state, null);
    expect(visible.map((q) => q.key)).toEqual(["life-stage", "program-gender"]);
    expect(pruned.has("service-intent")).toBe(false);
  });

  it("service-timing shows only when service-intent is army/sherut-leumi/unsure", () => {
    const state: FlowAnswerState = new Map([
      ["life-stage", ["working"]],
      ["service-intent", ["army"]],
    ]);
    const { visible } = resolveFlow(questions, state, null);
    expect(visible.map((q) => q.key)).toContain("service-timing");
  });

  it("service-timing stays hidden when service-intent is skipped", () => {
    const state: FlowAnswerState = new Map([
      ["life-stage", ["working"]],
      ["service-intent", null], // explicit skip
    ]);
    const { visible } = resolveFlow(questions, state, null);
    expect(visible.map((q) => q.key)).not.toContain("service-timing");
  });

  it("current resumes at the first visible question with no entry", () => {
    const state: FlowAnswerState = new Map([["life-stage", ["still-in-hs"]]]);
    const { current } = resolveFlow(questions, state, null);
    expect(current?.key).toBe("program-gender");
  });

  it("current is null (submit screen) only when every visible question is answered", () => {
    const state: FlowAnswerState = new Map([
      ["life-stage", ["still-in-hs"]],
      ["program-gender", ["boys-only"]],
    ]);
    const { current } = resolveFlow(questions, state, null);
    expect(current).toBeNull();
  });

  it("an explicit ?q= revisits an already-answered visible question (Back / Edit)", () => {
    const state: FlowAnswerState = new Map([
      ["life-stage", ["still-in-hs"]],
      ["program-gender", ["boys-only"]],
    ]);
    const { current } = resolveFlow(questions, state, "life-stage");
    expect(current?.key).toBe("life-stage");
  });

  it("an explicit ?q= naming a hidden question is ignored, falling back to resume logic", () => {
    const state: FlowAnswerState = new Map([["life-stage", ["still-in-hs"]]]);
    const { current } = resolveFlow(questions, state, "opener"); // opener is hidden on this path
    expect(current?.key).toBe("program-gender");
  });

  it("prevKey walks the VISIBLE list, skipping a hidden question", () => {
    // life-stage=still-in-hs hides opener; program-gender's prevKey should be life-stage
    const state: FlowAnswerState = new Map([["life-stage", ["still-in-hs"]]]);
    const { prevKey } = resolveFlow(questions, state, "program-gender");
    expect(prevKey).toBe("life-stage");
  });

  it("prevKey is null for the first visible question", () => {
    const { prevKey } = resolveFlow(questions, new Map(), "life-stage");
    expect(prevKey).toBeNull();
  });

  it("prevKey from the submit screen is the last visible question", () => {
    const state: FlowAnswerState = new Map([
      ["life-stage", ["still-in-hs"]],
      ["program-gender", ["boys-only"]],
    ]);
    const { prevKey } = resolveFlow(questions, state, null);
    expect(prevKey).toBe("program-gender");
  });

  it("a skipped question yields no entry contributing to conditionAnswers/criteria construction", () => {
    const state: FlowAnswerState = new Map([
      ["life-stage", ["working"]],
      ["service-intent", null],
    ]);
    const { conditionAnswers } = resolveFlow(questions, state, null);
    expect(conditionAnswers["service-intent"]).toBeUndefined();
  });

  it("a video-only interstitial question (no options) resolves visibleOptions to []", () => {
    const state: FlowAnswerState = new Map([["life-stage", ["working"]]]);
    const { visibleOptions } = resolveFlow(questions, state, "opener");
    expect(visibleOptions).toEqual([]);
  });

  it("acknowledging an interstitial (empty array) advances past it, and survives a serialize/parse round-trip", () => {
    const state: FlowAnswerState = new Map([
      ["life-stage", ["working"]],
      ["opener", []], // "Continue" clicked with no options to select
    ]);
    const { current } = resolveFlow(questions, state, null);
    expect(current?.key).toBe("program-gender"); // NOT stuck back on opener

    // The regression this guards: round-tripping through the URL must not lose the
    // acknowledgment and re-show the interstitial.
    const reparsed = parseAnswerState(serializeAnswerState(state));
    const { current: currentAfterRoundTrip } = resolveFlow(questions, reparsed, null);
    expect(currentAfterRoundTrip?.key).toBe("program-gender");
  });
});

describe("resolveFlow drops a stale cross-option-set answer (Q6's boys/girls/mixed sets)", () => {
  const gender = question({
    key: "program-gender",
    order: 0,
    options: [option({ key: "boys-only", label: "Boys only" }), option({ key: "girls-only", label: "Girls only" })],
  });
  const essence = question({
    key: "program-essence",
    order: 1,
    optionSetRules: {
      v: 1,
      default: "mixed",
      rules: [
        { optionSetKey: "boys", when: { type: "answerIn", questionKey: "program-gender", optionKeys: ["boys-only"] } },
        { optionSetKey: "girls", when: { type: "answerIn", questionKey: "program-gender", optionKeys: ["girls-only"] } },
      ],
    },
    defaultOptionSetKey: "mixed",
    options: [
      option({ key: "israeli-yeshiva", label: "Israeli yeshiva", optionSetKeys: ["boys"] }),
      option({ key: "israeli-midrasha", label: "Israeli midrasha", optionSetKeys: ["girls"] }),
      option({ key: "religious-mechina", label: "Religious mechina", optionSetKeys: [] }),
    ],
  });
  const questions = [gender, essence];

  it("re-asks program-essence after backing up and switching gender out of the answered option's set", () => {
    // Answered under the "boys" set, then gender is changed to girls-only -- israeli-yeshiva
    // is not a member of the now-resolved "girls" set.
    const state: FlowAnswerState = new Map([
      ["program-gender", ["girls-only"]],
      ["program-essence", ["israeli-yeshiva"]],
    ]);
    const { current, state: pruned } = resolveFlow(questions, state, null);
    expect(current?.key).toBe("program-essence"); // re-asked, not treated as already answered
    expect(pruned.has("program-essence")).toBe(false);
  });

  it("excludes the stale answer from conditionAnswers so a later condition can't observe it", () => {
    const state: FlowAnswerState = new Map([
      ["program-gender", ["girls-only"]],
      ["program-essence", ["israeli-yeshiva"]],
    ]);
    const { conditionAnswers } = resolveFlow(questions, state, null);
    expect(conditionAnswers["program-essence"]).toBeUndefined();
  });

  it("a universal option (empty optionSetKeys) stays valid across a gender change", () => {
    const state: FlowAnswerState = new Map([
      ["program-gender", ["girls-only"]],
      ["program-essence", ["religious-mechina"]],
    ]);
    const { current, state: pruned } = resolveFlow(questions, state, null);
    expect(current).toBeNull(); // still answered -- religious-mechina is valid in every set
    expect(pruned.get("program-essence")).toEqual(["religious-mechina"]);
  });

  it("an answer that still belongs to its resolved set survives unchanged", () => {
    const state: FlowAnswerState = new Map([
      ["program-gender", ["boys-only"]],
      ["program-essence", ["israeli-yeshiva"]],
    ]);
    const { current, state: pruned } = resolveFlow(questions, state, null);
    expect(current).toBeNull();
    expect(pruned.get("program-essence")).toEqual(["israeli-yeshiva"]);
  });
});

describe("buildMatchHref", () => {
  it("assembles a canonical /match URL from state + current question", () => {
    const state: FlowAnswerState = new Map([["life-stage", ["working"]]]);
    const href = buildMatchHref("/match", "program-gender", state);
    expect(href).toBe("/match?a=life-stage%3Aworking&q=program-gender");
  });

  it("bare /match when state is empty and no question given", () => {
    expect(buildMatchHref("/match", null, new Map())).toBe("/match");
  });

  it("includes the session id when given", () => {
    const state: FlowAnswerState = new Map([["life-stage", ["working"]]]);
    const href = buildMatchHref("/match/results", null, state, "sess-123");
    expect(href).toBe("/match/results?a=life-stage%3Aworking&s=sess-123");
  });

  it("omits s entirely when not given", () => {
    expect(buildMatchHref("/match", null, new Map())).not.toContain("s=");
  });
});

describe("answerStateToRecord / recordToAnswerState (admin preview's POST body encoding)", () => {
  it("round-trips a mix of answers, an explicit skip, and an acknowledged interstitial", () => {
    const state: FlowAnswerState = new Map([
      ["life-stage", ["working"]],
      ["service-intent", null],
      ["opener", []],
    ]);
    const record = answerStateToRecord(state);
    expect(record).toEqual({ "life-stage": ["working"], "service-intent": null, opener: [] });
    expect(recordToAnswerState(record)).toEqual(state);
  });

  it("empty state round-trips to an empty record and back", () => {
    expect(answerStateToRecord(new Map())).toEqual({});
    expect(recordToAnswerState({})).toEqual(new Map());
  });
});

describe("applyOptionOverrides (admin preview's not-yet-saved matchMode edits)", () => {
  const q = question({
    key: "program-gender",
    order: 0,
    options: [
      option({ key: "boys-only", label: "Boys only", matchMode: "REQUIRE" }),
      option({ key: "mixed", label: "Mixed", matchMode: "WEIGHT" }),
    ],
  });

  it("returns the input array unchanged (same reference) when there's nothing to override", () => {
    const input = [q];
    const result = applyOptionOverrides(input, new Map());
    expect(result).toBe(input);
  });

  it("overrides only the named option's matchMode, leaving its other fields and sibling options untouched", () => {
    const boysOnlyId = q.options[0].id;
    const result = applyOptionOverrides([q], new Map([[boysOnlyId, "WEIGHT"]]));
    expect(result[0].options[0].matchMode).toBe("WEIGHT");
    expect(result[0].options[0].key).toBe("boys-only"); // untouched
    expect(result[0].options[1].matchMode).toBe("WEIGHT"); // sibling unaffected (was already WEIGHT)
    expect(q.options[0].matchMode).toBe("REQUIRE"); // original question object is never mutated
  });

  it("a WEIGHT override on a REQUIRE option is exactly what 'preview downgrading this eliminator' needs", () => {
    const boysOnlyId = q.options[0].id;
    const result = applyOptionOverrides([q], new Map([[boysOnlyId, "WEIGHT"]]));
    expect(result[0].options.every((o) => o.matchMode === "WEIGHT")).toBe(true);
  });
});

describe("resolveFlow coverage gating (live-catalog option/question suppression)", () => {
  const lifeStage = question({
    key: "life-stage",
    order: 0,
    options: [
      option({ key: "still-in-hs", label: "Still in HS", matchMode: "REQUIRE", tagSlugs: ["age-hs"] }),
      option({ key: "working", label: "Working", matchMode: "WEIGHT", tagSlugs: ["age-post-college"] }),
    ],
  });
  const programType = question({
    key: "program-type",
    order: 1,
    options: [
      option({ key: "religious", label: "Religious mechina", tagSlugs: ["religious-mechina"] }),
      option({ key: "mixed", label: "Mixed", tagSlugs: [] }),
      option({ key: "academic", label: "Academic", tagSlugs: ["academic"] }),
    ],
  });
  const questions = [lifeStage, programType];

  /** A fake OptionCoverageCounter: fixed counts per option key (both life-stage
   * options default to a healthy 5 unless overridden, so tests can focus on
   * program-type's gating without also tripping guard 1 on life-stage). Records
   * every call so tests can assert what eliminatorsSoFar the walk actually built. */
  function fakeCounter(
    overrides: Record<string, number>,
    calls: { option: string; eliminators: CoverageEliminator[] }[] = []
  ): OptionCoverageCounter {
    const coverageByKey: Record<string, number> = { "still-in-hs": 5, working: 5, ...overrides };
    return (opt, eliminatorsSoFar) => {
      calls.push({ option: opt.key, eliminators: eliminatorsSoFar });
      return coverageByKey[opt.key] ?? 0;
    };
  }

  it("suppresses only the below-floor option, keeping the rest visible", () => {
    const counter = fakeCounter({ religious: 1, mixed: 5, academic: 4 });
    const state: FlowAnswerState = new Map([["life-stage", ["working"]]]);
    const { visibleOptions } = resolveFlow(questions, state, "program-type", { counter, floor: 3 });
    expect(visibleOptions.map((o) => o.key)).toEqual(["mixed", "academic"]);
  });

  it("guard 1: fewer than 2 surviving options drops the whole question, no stub", () => {
    const counter = fakeCounter({ religious: 1, mixed: 0, academic: 4 });
    const state: FlowAnswerState = new Map([["life-stage", ["working"]]]);
    const { visible, coverageReport } = resolveFlow(questions, state, null, { counter, floor: 3 });
    expect(visible.map((q) => q.key)).toEqual(["life-stage"]); // program-type dropped entirely
    expect(coverageReport?.get("program-type")?.droppedByCoverage).toBe(true);
    expect(coverageReport?.get("program-type")?.options.map((o) => [o.option.key, o.suppressed])).toEqual([
      ["religious", true],
      ["mixed", true],
      ["academic", false],
    ]);
  });

  it("never gates on a WEIGHT-mode selection -- a WEIGHT option's own tagSlugs never become an eliminator", () => {
    const calls: { option: string; eliminators: CoverageEliminator[] }[] = [];
    const counter = fakeCounter({ religious: 5, mixed: 5, academic: 5 }, calls);
    const state: FlowAnswerState = new Map([["life-stage", ["working"]]]); // WEIGHT, has tagSlugs
    resolveFlow(questions, state, "program-type", { counter, floor: 3 });
    const programTypeCalls = calls.filter((c) => ["religious", "mixed", "academic"].includes(c.option));
    expect(programTypeCalls.length).toBeGreaterThan(0);
    expect(programTypeCalls.every((c) => c.eliminators.length === 0)).toBe(true);
  });

  it("a selected REQUIRE option DOES carry forward as an eliminator for the next question's gating", () => {
    const calls: { option: string; eliminators: CoverageEliminator[] }[] = [];
    const counter = fakeCounter({ religious: 5, mixed: 5, academic: 5 }, calls);
    const state: FlowAnswerState = new Map([["life-stage", ["still-in-hs"]]]); // REQUIRE
    resolveFlow(questions, state, "program-type", { counter, floor: 3 });
    const programTypeCalls = calls.filter((c) => ["religious", "mixed", "academic"].includes(c.option));
    expect(programTypeCalls.length).toBeGreaterThan(0);
    for (const c of programTypeCalls) {
      expect(c.eliminators).toEqual([{ tagSlugs: ["age-hs"], durationValues: [], requireIncludesUntagged: true }]);
    }
  });

  it("omitting coverage entirely reproduces prior behavior exactly, and coverageReport is absent", () => {
    const state: FlowAnswerState = new Map([["life-stage", ["working"]]]);
    const result = resolveFlow(questions, state, "program-type");
    expect(result.coverageReport).toBeUndefined();
    expect(result.visibleOptions.map((o) => o.key)).toEqual(["religious", "mixed", "academic"]);
  });

  it("a previously-selected option that's since fallen below the floor is treated as stale and re-asked", () => {
    const counter = fakeCounter({ religious: 1, mixed: 5, academic: 4 }); // religious now below floor
    const state: FlowAnswerState = new Map([
      ["life-stage", ["working"]],
      ["program-type", ["religious"]], // valid when picked, no longer covered
    ]);
    const { current, state: pruned } = resolveFlow(questions, state, null, { counter, floor: 3 });
    expect(current?.key).toBe("program-type"); // re-asked, not treated as already answered
    expect(pruned.has("program-type")).toBe(false);
  });
});
