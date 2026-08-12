import { describe, it, expect } from "vitest";
import {
  buildFlowRunInput,
  passesRequireTarget,
  survivingPrograms,
  hardFilterRelaxations,
  scoreCriterion,
  rankPrograms,
  STRONG_MIN_CRITERIA,
  type FlowCriterion,
  type FlowRequireTarget,
  type RankableProgram,
} from "./flowRank";
import type { FlowAnswerState, FlowOptionDTO, FlowQuestionDTO } from "./flowShared";

// -- fixtures mirroring the real taxonomy's shape (see lib/facetCounts.test.ts) --

const tagCategoryBySlug = new Map<string, string | null>([
  ["boys-only", "gender"],
  ["girls-only", "gender"],
  ["coed", "gender"],
  ["rz-modern-orthodox", "affiliation"],
  ["flexible-religously", "affiliation"],
  ["essence-spiritual-growth", "essence"],
  ["essence-travel", "essence"],
]);

const programs: RankableProgram[] = [
  {
    id: "1",
    name: "Alpha Yeshiva",
    durationType: "GAP_YEAR",
    tagSlugs: ["boys-only", "rz-modern-orthodox", "essence-spiritual-growth"],
  },
  { id: "2", name: "Beta Program", durationType: "GAP_YEAR", tagSlugs: ["boys-only", "essence-travel"] },
  { id: "3", name: "Gamma Trip", durationType: "SUMMER", tagSlugs: ["coed", "essence-travel"] },
  { id: "4", name: "Delta Mechina", durationType: "GAP_YEAR", tagSlugs: [] }, // no gender tag at all
  { id: "5", name: "Epsilon Seminary", durationType: "GAP_YEAR", tagSlugs: ["girls-only", "essence-spiritual-growth"] },
];

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

describe("buildFlowRunInput", () => {
  const genderQuestion = question({
    key: "program-gender",
    order: 0,
    options: [
      option({ key: "boys-only", label: "Boys only", matchMode: "REQUIRE", tagSlugs: ["boys-only"], weight: 0 }),
      option({ key: "mixed", label: "Mixed", matchMode: "WEIGHT", tagSlugs: ["coed"], weight: 2 }),
    ],
  });
  const essenceQuestion = question({
    key: "essence",
    order: 1,
    options: [option({ key: "spiritual", label: "Spiritual growth", tagSlugs: ["essence-spiritual-growth"], weight: 1 })],
  });

  it("splits WEIGHT and REQUIRE options into criteria vs requireTargets", () => {
    const state: FlowAnswerState = new Map([["program-gender", ["boys-only"]]]);
    const { criteria, requireTargets } = buildFlowRunInput([genderQuestion], state);
    expect(criteria).toEqual([]);
    expect(requireTargets).toHaveLength(1);
    expect(requireTargets[0]).toMatchObject({ questionKey: "program-gender", tagSlugs: ["boys-only"] });
  });

  it("a WEIGHT option produces a criterion", () => {
    const state: FlowAnswerState = new Map([["program-gender", ["mixed"]]]);
    const { criteria, requireTargets } = buildFlowRunInput([genderQuestion], state);
    expect(requireTargets).toEqual([]);
    expect(criteria).toEqual([
      { questionKey: "program-gender", label: "Mixed", weight: 2, tagSlugs: ["coed"], durationValues: [] },
    ]);
  });

  it("a skipped question contributes NEITHER a criterion NOR a require target", () => {
    const state: FlowAnswerState = new Map([
      ["program-gender", null], // explicit skip
      ["essence", ["spiritual"]],
    ]);
    const { criteria, requireTargets } = buildFlowRunInput([genderQuestion, essenceQuestion], state);
    expect(requireTargets).toEqual([]);
    expect(criteria).toHaveLength(1);
    expect(criteria[0].questionKey).toBe("essence");
  });

  it("a not-yet-reached question (absent from state) contributes nothing", () => {
    const { criteria, requireTargets } = buildFlowRunInput([genderQuestion, essenceQuestion], new Map());
    expect(criteria).toEqual([]);
    expect(requireTargets).toEqual([]);
  });

  it("only questions in `visible` are consulted, even if state carries a stranded answer", () => {
    const state: FlowAnswerState = new Map([
      ["program-gender", ["mixed"]],
      ["essence", ["spiritual"]], // essence not passed as `visible` here -- simulates a hidden/pruned question
    ]);
    const { criteria } = buildFlowRunInput([genderQuestion], state);
    expect(criteria).toHaveLength(1);
    expect(criteria[0].questionKey).toBe("program-gender");
  });
});

describe("passesRequireTarget / passesAllRequireTargets -- the two hard eliminators", () => {
  const boysOnlyTarget: FlowRequireTarget = {
    questionKey: "program-gender",
    label: "Boys only",
    tagSlugs: ["boys-only"],
    durationValues: [],
    requireIncludesUntagged: true,
  };

  it("a program carrying the required tag passes", () => {
    expect(passesRequireTarget(programs[0], boysOnlyTarget, tagCategoryBySlug)).toBe(true);
  });

  it("a program carrying a CONFLICTING tag in the same category is eliminated", () => {
    expect(passesRequireTarget(programs[4], boysOnlyTarget, tagCategoryBySlug)).toBe(false); // girls-only
    expect(passesRequireTarget(programs[2], boysOnlyTarget, tagCategoryBySlug)).toBe(false); // coed
  });

  it("a program with NO tag at all in the required category survives (requireIncludesUntagged)", () => {
    expect(passesRequireTarget(programs[3], boysOnlyTarget, tagCategoryBySlug)).toBe(true); // no gender tag
  });

  it("requireIncludesUntagged=false makes absence disqualifying instead", () => {
    const strict: FlowRequireTarget = { ...boysOnlyTarget, requireIncludesUntagged: false };
    expect(passesRequireTarget(programs[3], strict, tagCategoryBySlug)).toBe(false);
    expect(passesRequireTarget(programs[0], strict, tagCategoryBySlug)).toBe(true); // still has the tag
  });

  it("a duration-restricting target has no untagged case", () => {
    const stillInHs: FlowRequireTarget = {
      questionKey: "life-stage",
      label: "Still in high school",
      tagSlugs: [],
      durationValues: ["SUMMER", "SHORT", "TEN_DAY"],
      requireIncludesUntagged: true,
    };
    expect(passesRequireTarget(programs[2], stillInHs, tagCategoryBySlug)).toBe(true); // SUMMER
    expect(passesRequireTarget(programs[0], stillInHs, tagCategoryBySlug)).toBe(false); // GAP_YEAR
  });

  it("AND across multiple targets: two disjoint duration restrictions intersect to zero survivors", () => {
    const summerOnly: FlowRequireTarget = {
      questionKey: "q-a",
      label: "Summer",
      tagSlugs: [],
      durationValues: ["SUMMER"],
      requireIncludesUntagged: true,
    };
    const gapYearOnly: FlowRequireTarget = {
      questionKey: "q-b",
      label: "Gap year",
      tagSlugs: [],
      durationValues: ["GAP_YEAR"],
      requireIncludesUntagged: true,
    };
    const survivors = survivingPrograms(programs, [summerOnly, gapYearOnly], tagCategoryBySlug);
    expect(survivors).toEqual([]);
  });

  it("survivingPrograms with an empty require list keeps everything", () => {
    expect(survivingPrograms(programs, [], tagCategoryBySlug)).toEqual(programs);
  });

  it("matches the live-data arithmetic: boys-only-or-untagged keeps boys-only + untagged, drops girls-only/coed", () => {
    const survivors = survivingPrograms(programs, [boysOnlyTarget], tagCategoryBySlug);
    expect(survivors.map((p) => p.id).sort()).toEqual(["1", "2", "4"]); // boys-only x2 + untagged
  });
});

describe("hardFilterRelaxations", () => {
  it("reports the surviving count if each ONE eliminator were relaxed, holding others fixed", () => {
    const boysOnly: FlowRequireTarget = {
      questionKey: "program-gender",
      label: "Boys only",
      tagSlugs: ["boys-only"],
      durationValues: [],
      requireIncludesUntagged: true,
    };
    const summerOnly: FlowRequireTarget = {
      questionKey: "life-stage",
      label: "Still in high school",
      tagSlugs: [],
      durationValues: ["SUMMER"],
      requireIncludesUntagged: true,
    };
    // together: boys-only-or-untagged AND SUMMER -> nothing (no boys-only/untagged program is SUMMER)
    expect(survivingPrograms(programs, [boysOnly, summerOnly], tagCategoryBySlug)).toEqual([]);
    const relaxations = hardFilterRelaxations(programs, [boysOnly, summerOnly], tagCategoryBySlug);
    const byKey = Object.fromEntries(relaxations.map((r) => [r.questionKey, r.count]));
    expect(byKey["program-gender"]).toBe(1); // relax gender, keep SUMMER -> program 3 (Gamma Trip)
    expect(byKey["life-stage"]).toBe(3); // relax duration, keep boys-only-or-untagged -> 1, 2, 4
  });
});

describe("scoreCriterion", () => {
  it("full credit when every category+duration part matches", () => {
    const criterion: FlowCriterion = {
      questionKey: "essence",
      label: "Spiritual growth",
      weight: 1,
      tagSlugs: ["essence-spiritual-growth"],
      durationValues: [],
    };
    expect(scoreCriterion(programs[0], criterion, tagCategoryBySlug)).toEqual({ fraction: 1, totalParts: 1 });
  });

  it("graduated partial credit across two categories -- not an all-or-nothing AND", () => {
    const criterion: FlowCriterion = {
      questionKey: "combo",
      label: "combo",
      weight: 1,
      tagSlugs: ["boys-only", "essence-spiritual-growth"], // two DIFFERENT categories
      durationValues: [],
    };
    // program 2: boys-only yes, essence-spiritual-growth no -> half credit
    expect(scoreCriterion(programs[1], criterion, tagCategoryBySlug)).toEqual({ fraction: 0.5, totalParts: 2 });
  });

  it("duration counts as one additional part", () => {
    const criterion: FlowCriterion = {
      questionKey: "duration",
      label: "duration",
      weight: 1,
      tagSlugs: [],
      durationValues: ["GAP_YEAR"],
    };
    expect(scoreCriterion(programs[0], criterion, tagCategoryBySlug)).toEqual({ fraction: 1, totalParts: 1 });
    expect(scoreCriterion(programs[2], criterion, tagCategoryBySlug)).toEqual({ fraction: 0, totalParts: 1 }); // SUMMER
  });

  it("a target-less criterion scores zero, never divides by zero", () => {
    const criterion: FlowCriterion = { questionKey: "empty", label: "empty", weight: 1, tagSlugs: [], durationValues: [] };
    expect(scoreCriterion(programs[0], criterion, tagCategoryBySlug)).toEqual({ fraction: 0, totalParts: 0 });
  });
});

describe("rankPrograms -- no hard cut, ever", () => {
  const spiritual: FlowCriterion = {
    questionKey: "essence",
    label: "Spiritual growth",
    weight: 1,
    tagSlugs: ["essence-spiritual-growth"],
    durationValues: [],
  };
  const gapYear: FlowCriterion = {
    questionKey: "duration",
    label: "Gap year",
    weight: 1,
    tagSlugs: [],
    durationValues: ["GAP_YEAR"],
  };
  const boysOnly: FlowCriterion = {
    questionKey: "program-gender",
    label: "Boys only",
    weight: 1,
    tagSlugs: ["boys-only"],
    durationValues: [],
  };

  it("returns every program it was given -- no .filter(), no .slice()", () => {
    const results = rankPrograms(programs, [spiritual, gapYear, boysOnly], tagCategoryBySlug);
    expect(results).toHaveLength(programs.length);
    expect(results.map((r) => r.program.id).sort()).toEqual(programs.map((p) => p.id).sort());
  });

  it("a 1-of-N program is present and sorts below a 3-of-N program", () => {
    const results = rankPrograms(programs, [spiritual, gapYear, boysOnly], tagCategoryBySlug);
    const byId = Object.fromEntries(results.map((r) => [r.program.id, r]));
    // program 1 (Alpha): boys-only + spiritual + GAP_YEAR -> matches all 3
    // program 3 (Gamma): coed + SUMMER, essence-travel -> matches none of these 3
    expect(byId["1"].matchedCriteria).toBe(3);
    expect(byId["3"].matchedCriteria).toBe(0);
    const idx1 = results.findIndex((r) => r.program.id === "1");
    const idx3 = results.findIndex((r) => r.program.id === "3");
    expect(idx1).toBeLessThan(idx3);
  });

  it("skip carries no weight: a run with a skipped question ranks identically to a run without it", () => {
    // Simulate "skip" by simply never including the criterion -- buildFlowRunInput's
    // contract guarantees a skipped question never produces a criterion at all, so
    // this equivalence is what makes that contract meaningful.
    const withTwo = rankPrograms(programs, [spiritual, gapYear], tagCategoryBySlug);
    const withTwoAgain = rankPrograms(programs, [spiritual, gapYear], tagCategoryBySlug);
    expect(withTwo.map((r) => ({ id: r.program.id, score: r.score }))).toEqual(
      withTwoAgain.map((r) => ({ id: r.program.id, score: r.score }))
    );
  });

  it("band clamps STRONG_MIN_CRITERIA to however many positive criteria were actually answered", () => {
    // Only 2 positive criteria answered -- a program matching both should still read "strong",
    // not perpetually "partial" because it can never reach the global 3.
    const results = rankPrograms(programs, [spiritual, gapYear], tagCategoryBySlug);
    const alpha = results.find((r) => r.program.id === "1")!;
    expect(alpha.matchedCriteria).toBe(2);
    expect(STRONG_MIN_CRITERIA).toBe(3); // the global constant is untouched
    expect(alpha.band).toBe("strong"); // clamped threshold = min(3, 2) = 2
  });

  it("zero answered criteria -> band is 'unranked' for everyone, not 'weak'", () => {
    const results = rankPrograms(programs, [], tagCategoryBySlug);
    expect(results.every((r) => r.band === "unranked")).toBe(true);
  });

  it("a negative-weight criterion demotes a matching program without counting as a matched preference", () => {
    const dislikesSpiritual: FlowCriterion = {
      questionKey: "learning",
      label: "School killed it for me",
      weight: -1,
      tagSlugs: ["essence-spiritual-growth"],
      durationValues: [],
    };
    const results = rankPrograms(programs, [dislikesSpiritual], tagCategoryBySlug);
    const alpha = results.find((r) => r.program.id === "1")!; // has essence-spiritual-growth
    const beta = results.find((r) => r.program.id === "2")!; // does not
    expect(alpha.matchedCriteria).toBe(0); // demoted, not "matched"
    expect(alpha.score).toBeLessThan(beta.score);
  });

  it("deterministic tiebreak: identical scores sort by name", () => {
    const flatA: RankableProgram = { id: "a", name: "Zeta", durationType: "GAP_YEAR", tagSlugs: [] };
    const flatB: RankableProgram = { id: "b", name: "Alpha", durationType: "GAP_YEAR", tagSlugs: [] };
    const results = rankPrograms([flatA, flatB], [], tagCategoryBySlug);
    expect(results.map((r) => r.program.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("tiebreak is stable across shuffled input order", () => {
    const shuffled = [...programs].reverse();
    const a = rankPrograms(programs, [spiritual, gapYear, boysOnly], tagCategoryBySlug).map((r) => r.program.id);
    const b = rankPrograms(shuffled, [spiritual, gapYear, boysOnly], tagCategoryBySlug).map((r) => r.program.id);
    expect(a).toEqual(b);
  });
});
