import { describe, it, expect } from "vitest";
import {
  conditionToBuilder,
  builderToCondition,
  optionSetRulesToBuilder,
  builderToOptionSetRules,
  normalizeGroup,
  validateConditionBuilder,
  validateOptionSetRulesBuilder,
  describeGroup,
  describeSetRules,
  collectOptionSetKeys,
  validateRawCondition,
  validateRawOptionSetRules,
  type BuilderGroup,
  type BuilderQuestionRef,
} from "./flowRuleBuilder";

const bank: BuilderQuestionRef[] = [
  {
    key: "life-stage",
    order: 0,
    prompt: "What stage will you be in when you go?",
    options: [
      { key: "high-school", label: "Still in high school", status: "ACTIVE" },
      { key: "working", label: "Working / later", status: "ACTIVE" },
    ],
  },
  {
    key: "program-gender",
    order: 1,
    prompt: "What kind of program are you looking for?",
    options: [
      { key: "boys-only", label: "Boys only", status: "ACTIVE" },
      { key: "girls-only", label: "Girls only", status: "ACTIVE" },
      { key: "mixed", label: "Mixed", status: "RETIRED" },
    ],
  },
  {
    key: "service-intent",
    order: 2,
    prompt: "Are you planning to serve?",
    options: [{ key: "army", label: "Army", status: "ACTIVE" }],
  },
];

describe("conditionToBuilder / builderToCondition round-trip", () => {
  it("null -> empty group, empty group -> null", () => {
    const result = conditionToBuilder(null);
    expect(result).toEqual({ ok: true, value: { combinator: "all", rows: [] } });
    expect(builderToCondition({ combinator: "all", rows: [] })).toBeNull();
  });

  it("round-trips a single answerIn row (bare leaf, not a 1-element all)", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "life-stage", operator: "isOneOf", optionKeys: ["working"] }],
    };
    const condition = builderToCondition(group);
    expect(condition).toEqual({
      v: 1,
      when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] },
    });
    const back = conditionToBuilder(condition);
    expect(back).toEqual({ ok: true, value: normalizeGroup(group) });
  });

  it("round-trips isNotOneOf via not(answerIn)", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "program-gender", operator: "isNotOneOf", optionKeys: ["boys-only"] }],
    };
    const condition = builderToCondition(group);
    expect(condition).toEqual({
      v: 1,
      when: { type: "not", of: { type: "answerIn", questionKey: "program-gender", optionKeys: ["boys-only"] } },
    });
    expect(conditionToBuilder(condition)).toEqual({ ok: true, value: normalizeGroup(group) });
  });

  it("round-trips answered and notAnswered", () => {
    const answeredGroup: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "life-stage", operator: "answered", optionKeys: [] }],
    };
    expect(conditionToBuilder(builderToCondition(answeredGroup))).toEqual({
      ok: true,
      value: normalizeGroup(answeredGroup),
    });

    const notAnsweredGroup: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "life-stage", operator: "notAnswered", optionKeys: [] }],
    };
    expect(conditionToBuilder(builderToCondition(notAnsweredGroup))).toEqual({
      ok: true,
      value: normalizeGroup(notAnsweredGroup),
    });
  });

  it("round-trips a multi-row 'all' group", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [
        { questionKey: "life-stage", operator: "isOneOf", optionKeys: ["working"] },
        { questionKey: "service-intent", operator: "answered", optionKeys: [] },
      ],
    };
    const condition = builderToCondition(group);
    expect(condition).toEqual({
      v: 1,
      when: {
        type: "all",
        of: [
          { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] },
          { type: "answered", questionKey: "service-intent" },
        ],
      },
    });
    expect(conditionToBuilder(condition)).toEqual({ ok: true, value: normalizeGroup(group) });
  });

  it("round-trips a multi-row 'any' group", () => {
    const group: BuilderGroup = {
      combinator: "any",
      rows: [
        { questionKey: "life-stage", operator: "isOneOf", optionKeys: ["working", "high-school"] },
        { questionKey: "program-gender", operator: "isNotOneOf", optionKeys: ["mixed"] },
      ],
    };
    const condition = builderToCondition(group);
    expect(condition).toEqual({
      v: 1,
      when: {
        type: "any",
        of: [
          { type: "answerIn", questionKey: "life-stage", optionKeys: ["working", "high-school"] },
          { type: "not", of: { type: "answerIn", questionKey: "program-gender", optionKeys: ["mixed"] } },
        ],
      },
    });
    expect(conditionToBuilder(condition)).toEqual({ ok: true, value: normalizeGroup(group) });
  });

  it("normalizeGroup dedupes optionKeys and clears them for answered/notAnswered", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [
        { questionKey: "life-stage", operator: "isOneOf", optionKeys: ["working", "working"] },
        { questionKey: "service-intent", operator: "answered", optionKeys: ["stray"] },
      ],
    };
    expect(normalizeGroup(group)).toEqual({
      combinator: "all",
      rows: [
        { questionKey: "life-stage", operator: "isOneOf", optionKeys: ["working"] },
        { questionKey: "service-intent", operator: "answered", optionKeys: [] },
      ],
    });
  });

  it("normalizeGroup forces combinator to 'all' at length <= 1, matching what serialization produces", () => {
    const group: BuilderGroup = {
      combinator: "any", // meaningless at length 1
      rows: [{ questionKey: "life-stage", operator: "answered", optionKeys: [] }],
    };
    expect(normalizeGroup(group).combinator).toBe("all");
  });
});

describe("conditionToBuilder: unmodelable / malformed shapes", () => {
  it("reports unmodelable for a nested group (any-inside-all)", () => {
    const showWhen = {
      v: 1,
      when: {
        type: "all",
        of: [
          { type: "answered", questionKey: "life-stage" },
          { type: "any", of: [{ type: "answered", questionKey: "service-intent" }] },
        ],
      },
    };
    expect(conditionToBuilder(showWhen)).toEqual({
      ok: false,
      reason: "This condition is too complex for the visual builder -- edit it as raw JSON.",
    });
  });

  it("reports unmodelable for 'not' wrapping a group", () => {
    const showWhen = {
      v: 1,
      when: { type: "not", of: { type: "all", of: [{ type: "answered", questionKey: "life-stage" }] } },
    };
    expect(conditionToBuilder(showWhen)).toEqual({
      ok: false,
      reason: "This condition is too complex for the visual builder -- edit it as raw JSON.",
    });
  });

  it("reports unmodelable for a depth-4 rule (double-nested not)", () => {
    const showWhen = {
      v: 1,
      when: { type: "not", of: { type: "not", of: { type: "answered", questionKey: "life-stage" } } },
    };
    // not(not(leaf)): outer nodeToRow sees inner.type === "not", not answerIn/answered -> null
    expect(conditionToBuilder(showWhen)).toEqual({
      ok: false,
      reason: "This condition is too complex for the visual builder -- edit it as raw JSON.",
    });
  });

  it("reports an unrecognized shape for structurally invalid JSON", () => {
    expect(conditionToBuilder({ not: "a valid condition" })).toEqual({
      ok: false,
      reason: "Not a recognized condition shape",
    });
  });
});

describe("optionSetRulesToBuilder / builderToOptionSetRules round-trip", () => {
  it("null -> empty rules, empty rules -> null", () => {
    expect(optionSetRulesToBuilder(null)).toEqual({ ok: true, value: { default: "", rules: [] } });
    expect(builderToOptionSetRules({ default: "", rules: [] })).toBeNull();
  });

  it("round-trips a default-only config", () => {
    const rules = { default: "mixed", rules: [] };
    const json = builderToOptionSetRules(rules);
    expect(json).toEqual({ v: 1, default: "mixed", rules: [] });
    expect(optionSetRulesToBuilder(json)).toEqual({ ok: true, value: rules });
  });

  it("round-trips rules keyed off program-gender", () => {
    const rules = {
      default: "mixed",
      rules: [
        { optionSetKey: "boys", row: { questionKey: "program-gender", operator: "isOneOf" as const, optionKeys: ["boys-only"] } },
        { optionSetKey: "girls", row: { questionKey: "program-gender", operator: "isOneOf" as const, optionKeys: ["girls-only"] } },
      ],
    };
    const json = builderToOptionSetRules(rules);
    expect(json).toEqual({
      v: 1,
      default: "mixed",
      rules: [
        { optionSetKey: "boys", when: { type: "answerIn", questionKey: "program-gender", optionKeys: ["boys-only"] } },
        { optionSetKey: "girls", when: { type: "answerIn", questionKey: "program-gender", optionKeys: ["girls-only"] } },
      ],
    });
    expect(optionSetRulesToBuilder(json)).toEqual({ ok: true, value: rules });
  });

  it("reports unmodelable when a rule's condition is a group", () => {
    const json = {
      v: 1,
      default: "mixed",
      rules: [
        {
          optionSetKey: "boys",
          when: { type: "all", of: [{ type: "answered", questionKey: "life-stage" }, { type: "answered", questionKey: "service-intent" }] },
        },
      ],
    };
    expect(optionSetRulesToBuilder(json)).toEqual({
      ok: false,
      reason: "This condition is too complex for the visual builder -- edit it as raw JSON.",
    });
  });
});

describe("validateConditionBuilder", () => {
  const self = { key: "service-intent", order: 2 };

  it("no problems for a valid backward reference", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "life-stage", operator: "isOneOf", optionKeys: ["working"] }],
    };
    expect(validateConditionBuilder(group, self, bank)).toEqual([]);
  });

  it("flags an unknown question key", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "nonexistent", operator: "answered", optionKeys: [] }],
    };
    expect(validateConditionBuilder(group, self, bank)[0]).toMatch(/unknown question "nonexistent"/);
  });

  it("flags a self-reference", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "service-intent", operator: "answered", optionKeys: [] }],
    };
    expect(validateConditionBuilder(group, self, bank)[0]).toMatch(/references itself/);
  });

  it("flags a forward reference", () => {
    // self is life-stage (order 0); referencing service-intent (order 2) is forward.
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "service-intent", operator: "answered", optionKeys: [] }],
    };
    expect(validateConditionBuilder(group, { key: "life-stage", order: 0 }, bank)[0]).toMatch(
      /isn't ordered before this question/
    );
  });

  it("flags an unknown option key", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "life-stage", operator: "isOneOf", optionKeys: ["workign"] }],
    };
    expect(validateConditionBuilder(group, self, bank)[0]).toMatch(/unknown option key\(s\) \[workign\]/);
  });

  it("accepts a retired option as a valid target", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "program-gender", operator: "isOneOf", optionKeys: ["mixed"] }],
    };
    expect(validateConditionBuilder(group, self, bank)).toEqual([]);
  });

  it("flags a row with no question chosen", () => {
    const group: BuilderGroup = { combinator: "all", rows: [{ questionKey: "", operator: "answered", optionKeys: [] }] };
    expect(validateConditionBuilder(group, self, bank)[0]).toMatch(/choose a question/);
  });

  it("flags an isOneOf row with no options chosen", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "life-stage", operator: "isOneOf", optionKeys: [] }],
    };
    expect(validateConditionBuilder(group, self, bank)[0]).toMatch(/choose at least one option/);
  });
});

describe("validateOptionSetRulesBuilder", () => {
  const self = { key: "program-essence", order: 5 };

  it("no problems for a valid config", () => {
    const rules = {
      default: "mixed",
      rules: [{ optionSetKey: "boys", row: { questionKey: "program-gender", operator: "isOneOf" as const, optionKeys: ["boys-only"] } }],
    };
    expect(validateOptionSetRulesBuilder(rules, self, bank)).toEqual([]);
  });

  it("requires a default when any rule exists", () => {
    const rules = {
      default: "",
      rules: [{ optionSetKey: "boys", row: { questionKey: "program-gender", operator: "isOneOf" as const, optionKeys: ["boys-only"] } }],
    };
    expect(validateOptionSetRulesBuilder(rules, self, bank)).toContainEqual(
      "Default option set is required when any rule is set"
    );
  });

  it("does not require a default when there are no rules (clears the field)", () => {
    expect(validateOptionSetRulesBuilder({ default: "", rules: [] }, self, bank)).toEqual([]);
  });

  it("flags a rule with no option-set key chosen", () => {
    const rules = {
      default: "mixed",
      rules: [{ optionSetKey: "", row: { questionKey: "program-gender", operator: "isOneOf" as const, optionKeys: ["boys-only"] } }],
    };
    expect(validateOptionSetRulesBuilder(rules, self, bank)[0]).toMatch(/choose an option set/);
  });
});

describe("describeGroup / describeSetRules", () => {
  it("empty group describes as empty string", () => {
    expect(describeGroup({ combinator: "all", rows: [] }, bank)).toBe("");
  });

  it("describes a single isOneOf row", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "program-gender", operator: "isOneOf", optionKeys: ["boys-only"] }],
    };
    expect(describeGroup(group, bank)).toBe("'What kind of program are you looking for?' is Boys only");
  });

  it("describes multiple options joined with 'or'", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "program-gender", operator: "isOneOf", optionKeys: ["boys-only", "girls-only"] }],
    };
    expect(describeGroup(group, bank)).toBe("'What kind of program are you looking for?' is Boys only or Girls only");
  });

  it("describes isNotOneOf, answered, notAnswered", () => {
    expect(
      describeGroup(
        { combinator: "all", rows: [{ questionKey: "program-gender", operator: "isNotOneOf", optionKeys: ["boys-only"] }] },
        bank
      )
    ).toBe("'What kind of program are you looking for?' is not Boys only");
    expect(
      describeGroup({ combinator: "all", rows: [{ questionKey: "life-stage", operator: "answered", optionKeys: [] }] }, bank)
    ).toBe("'What stage will you be in when you go?' is answered");
    expect(
      describeGroup({ combinator: "all", rows: [{ questionKey: "life-stage", operator: "notAnswered", optionKeys: [] }] }, bank)
    ).toBe("'What stage will you be in when you go?' is not answered");
  });

  it("joins multiple rows with AND / OR per combinator", () => {
    const group: BuilderGroup = {
      combinator: "any",
      rows: [
        { questionKey: "life-stage", operator: "answered", optionKeys: [] },
        { questionKey: "service-intent", operator: "answered", optionKeys: [] },
      ],
    };
    expect(describeGroup(group, bank)).toBe(
      "'What stage will you be in when you go?' is answered OR 'Are you planning to serve?' is answered"
    );
  });

  it("falls back to a verbatim unknown-key label rather than omitting the row", () => {
    const group: BuilderGroup = {
      combinator: "all",
      rows: [{ questionKey: "ghost-question", operator: "answered", optionKeys: [] }],
    };
    expect(describeGroup(group, bank)).toBe('unknown question "ghost-question" is answered');
  });

  it("describeSetRules produces one line per rule plus a default line", () => {
    const rules = {
      default: "mixed",
      rules: [{ optionSetKey: "boys", row: { questionKey: "program-gender", operator: "isOneOf" as const, optionKeys: ["boys-only"] } }],
    };
    expect(describeSetRules(rules, bank)).toEqual([
      "'What kind of program are you looking for?' is Boys only → option set: boys",
      "Otherwise → option set: mixed",
    ]);
  });

  it("describeSetRules omits the default line when unset", () => {
    expect(describeSetRules({ default: "", rules: [] }, bank)).toEqual([]);
  });
});

describe("validateRawCondition (unmodelable rules still get reference validation)", () => {
  const self = { key: "service-intent", order: 2 };

  it("no problems for a valid nested-group condition", () => {
    const condition = {
      v: 1 as const,
      when: {
        type: "all" as const,
        of: [
          { type: "answered" as const, questionKey: "life-stage" },
          { type: "any" as const, of: [{ type: "answered" as const, questionKey: "life-stage" }] },
        ],
      },
    };
    expect(validateRawCondition(condition, self, bank)).toEqual([]);
  });

  it("flags an unknown question buried inside a nested group", () => {
    const condition = {
      v: 1 as const,
      when: {
        type: "all" as const,
        of: [
          { type: "answered" as const, questionKey: "life-stage" },
          { type: "any" as const, of: [{ type: "answered" as const, questionKey: "ghost" }] },
        ],
      },
    };
    expect(validateRawCondition(condition, self, bank)[0]).toMatch(/unknown question "ghost"/);
  });

  it("flags a forward reference buried inside 'not'", () => {
    const condition = {
      v: 1 as const,
      when: { type: "not" as const, of: { type: "all" as const, of: [{ type: "answered" as const, questionKey: "life-stage" }] } },
    };
    // self is life-stage itself here to force a self-reference through the not-wrapped group
    expect(validateRawCondition(condition, { key: "life-stage", order: 0 }, bank)[0]).toMatch(/references itself/);
  });

  it("flags an unknown option key inside a nested group", () => {
    const condition = {
      v: 1 as const,
      when: {
        type: "all" as const,
        of: [
          { type: "answerIn" as const, questionKey: "life-stage", optionKeys: ["nope"] },
          { type: "answered" as const, questionKey: "life-stage" },
        ],
      },
    };
    expect(validateRawCondition(condition, self, bank)[0]).toMatch(/unknown option key\(s\) \[nope\]/);
  });
});

describe("validateRawOptionSetRules", () => {
  const self = { key: "program-essence", order: 5 };

  it("no problems for a valid config with a nested-group rule", () => {
    const rules = {
      v: 1 as const,
      default: "mixed",
      rules: [
        {
          optionSetKey: "boys",
          when: { type: "all" as const, of: [{ type: "answered" as const, questionKey: "life-stage" }, { type: "answered" as const, questionKey: "program-gender" }] },
        },
      ],
    };
    expect(validateRawOptionSetRules(rules, self, bank)).toEqual([]);
  });

  it("flags an unknown question inside a rule and labels which rule", () => {
    const rules = {
      v: 1 as const,
      default: "mixed",
      rules: [{ optionSetKey: "boys", when: { type: "answered" as const, questionKey: "ghost" } }],
    };
    expect(validateRawOptionSetRules(rules, self, bank)[0]).toMatch(/Rule \(→ boys\): references unknown question "ghost"/);
  });
});

describe("collectOptionSetKeys", () => {
  it("collects from option optionSetKeys, defaultOptionSetKey, and existing rules -- deduped and sorted", () => {
    const question = {
      defaultOptionSetKey: "mixed",
      optionSetRules: {
        v: 1,
        default: "mixed",
        rules: [{ optionSetKey: "girls", when: { type: "answered" as const, questionKey: "x" } }],
      },
      options: [{ optionSetKeys: ["boys", "mixed"] }, { optionSetKeys: [] }],
    };
    expect(collectOptionSetKeys(question)).toEqual(["boys", "girls", "mixed"]);
  });

  it("returns an empty array when nothing is configured", () => {
    expect(collectOptionSetKeys({ defaultOptionSetKey: null, optionSetRules: null, options: [] })).toEqual([]);
  });
});
