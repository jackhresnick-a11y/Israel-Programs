/**
 * One-time content seed for /match v2's shipping question set
 * (find-v2-question-spec.md's "Trim list": Q1-Q7 live, Q8-Q10 retired -- one click
 * away in /admin/flow/questions, not deleted). Not idempotent: re-running throws on
 * the second run (question keys already exist -- createFlowQuestion has no upsert
 * semantics, matching lib/finder.ts's createFinderQuestion precedent), which is the
 * correct behavior for a script that should only ever run once.
 *
 * Every prompt/option label/showWhen condition below is copied verbatim from
 * find-v2-question-spec.md -- nothing paraphrased. Tag-based WEIGHT targets are
 * wired only where the mapping to the EXISTING live taxonomy (verified against
 * production, see CLAUDE.md's "/find v2" section) is unambiguous; an option with no
 * defensible tag mapping is seeded with weight 0 / no target -- recorded for
 * conditional branching and (later) clip triggers, contributing nothing to
 * ranking, rather than inventing a mapping that isn't in the spec.
 *
 * Every showWhen/optionSetRules reference below uses the REAL `.key` returned by
 * createFlowQuestion/createFlowOption -- never a hand-typed guess at what
 * slugify(label) would produce. CLAUDE.md's "Adding real programs" section
 * documents this exact failure mode (a hand-approximated slug silently matching
 * zero rows) as a real, recurring bug elsewhere in this codebase; the same
 * discipline applies here, and lib/flow.ts's assertConditionReferencesValid would
 * reject a wrong guess outright anyway (an "unknown question"/"unknown option key"
 * error), which is exactly why this script reads keys back rather than typing them.
 *
 * NOT included here: video clips. Every clip in the spec (the Q2 opener, Q5's
 * misery clip, Q6's taxonomy clip, Q7's not-a-learner clip, ...) needs REAL footage
 * that doesn't exist yet -- add them from /admin/flow/clips once it does.
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/seed-match-v2-questions.ts
 */
import { prisma } from "../lib/prisma";
import { createFlowQuestion, createFlowOption, updateFlowQuestion } from "../lib/flow";

async function main() {
  // ---- Q1: life-stage (FILTER) -- gates everything downstream ------------
  const q1 = await createFlowQuestion({
    prompt: "What stage will you be in when you go?",
    helpText:
      "Not what you are now -- a high school junior shopping for next year answers wrong if this means their current grade.",
    type: "FILTER",
  });
  await createFlowOption({
    questionId: q1.id,
    label: "Still in high school (going during high school)",
    matchMode: "REQUIRE",
    durationValues: ["SUMMER", "SHORT", "TEN_DAY"],
    weight: 0,
  });
  const q1RightAfterHs = await createFlowOption({
    questionId: q1.id,
    label: "Right after high school",
    weight: 1,
    tagSlugs: ["age-gap-year"],
  });
  await createFlowOption({
    questionId: q1.id,
    label: "During college -- summer or between semesters",
    weight: 1,
    durationValues: ["SUMMER"],
  });
  await createFlowOption({
    questionId: q1.id,
    label: "During college -- a full semester or year",
    weight: 1,
    durationValues: ["SEMESTER", "GAP_YEAR"],
  });
  const q1AfterCollege = await createFlowOption({
    questionId: q1.id,
    label: "After college",
    weight: 1,
    tagSlugs: ["age-post-college"],
  });
  const q1Working = await createFlowOption({
    questionId: q1.id,
    label: "Working / later",
    weight: 1,
    tagSlugs: ["age-post-college"],
  });
  console.log("seeded Q1 life-stage");

  const q1AdultPathOptionKeys = [q1RightAfterHs.key, q1AfterCollege.key, q1Working.key];

  // ---- Q2: opener (CHALLENGE, video-only interstitial -- zero options) ---
  const q2 = await createFlowQuestion({
    prompt: "Before we start...",
    helpText: "The argument for spending this year deliberately, not on autopilot.",
    type: "CHALLENGE",
  });
  await updateFlowQuestion(q2.id, {
    showWhen: { v: 1, when: { type: "answerIn", questionKey: q1.key, optionKeys: q1AdultPathOptionKeys } },
  });
  console.log("seeded Q2 opener");

  // ---- Q3: program-gender (FILTER) -- the other hard eliminator ----------
  const q3 = await createFlowQuestion({
    prompt: "What kind of program are you looking for?",
    helpText: "Asking about the program's makeup, not about you.",
    type: "FILTER",
  });
  const q3BoysOnly = await createFlowOption({ questionId: q3.id, label: "Boys only", matchMode: "REQUIRE", tagSlugs: ["boys-only"], weight: 0 });
  const q3GirlsOnly = await createFlowOption({ questionId: q3.id, label: "Girls only", matchMode: "REQUIRE", tagSlugs: ["girls-only"], weight: 0 });
  const q3Mixed = await createFlowOption({ questionId: q3.id, label: "Mixed", weight: 2, tagSlugs: ["coed"] });
  const q3NoPreference = await createFlowOption({ questionId: q3.id, label: "No preference", weight: 0 });
  console.log("seeded Q3 program-gender");

  // ---- Q4: service-intent (CHALLENGE, conditional) ------------------------
  const q4 = await createFlowQuestion({ prompt: "Are you planning to serve?", type: "CHALLENGE" });
  await updateFlowQuestion(q4.id, {
    showWhen: { v: 1, when: { type: "answerIn", questionKey: q1.key, optionKeys: q1AdultPathOptionKeys } },
  });
  await createFlowOption({ questionId: q4.id, label: "Army", weight: 1, tagSlugs: ["essence-pre-military"] });
  const q4SherutLeumi = await createFlowOption({ questionId: q4.id, label: "Sherut leumi", weight: 0 });
  await createFlowOption({ questionId: q4.id, label: "Not planning to -- college in the States", weight: 0 });
  const q4Unsure = await createFlowOption({ questionId: q4.id, label: "I don't know yet", weight: 0 });
  console.log("seeded Q4 service-intent");

  // ---- Q5: service-timing (CHALLENGE, conditional) ------------------------
  const q4Army = await prisma.flowOption.findFirstOrThrow({ where: { questionId: q4.id, label: "Army" } });
  const q5 = await createFlowQuestion({ prompt: "When would you want to start serving?", type: "CHALLENGE" });
  await updateFlowQuestion(q5.id, {
    showWhen: {
      v: 1,
      when: { type: "answerIn", questionKey: q4.key, optionKeys: [q4Army.key, q4SherutLeumi.key, q4Unsure.key] },
    },
  });
  await createFlowOption({ questionId: q5.id, label: "Straight in, as soon as I can", weight: 0 });
  await createFlowOption({ questionId: q5.id, label: "A year first", weight: 1, tagSlugs: ["essence-pre-military"] });
  await createFlowOption({ questionId: q5.id, label: "Two years first", weight: 0 });
  await createFlowOption({ questionId: q5.id, label: "Not sure", weight: 0 });
  console.log("seeded Q5 service-timing");

  // ---- Q6: program-essence (TRADEOFF, the flagship -- 3 option sets) ------
  const q6 = await createFlowQuestion({
    prompt: "What kind of program?",
    helpText: "Every option here is real. Picking one doesn't rule out the others -- it just weighs the results.",
    type: "TRADEOFF",
  });
  await updateFlowQuestion(q6.id, {
    optionSetRules: {
      v: 1,
      default: "mixed",
      rules: [
        { optionSetKey: "boys", when: { type: "answerIn", questionKey: q3.key, optionKeys: [q3BoysOnly.key] } },
        { optionSetKey: "girls", when: { type: "answerIn", questionKey: q3.key, optionKeys: [q3GirlsOnly.key] } },
      ],
    },
    defaultOptionSetKey: "mixed",
  });
  const q6IsraeliYeshiva = await createFlowOption({ questionId: q6.id, label: "Israeli yeshiva", optionSetKeys: ["boys"], weight: 2, tagSlugs: ["israeli-yeshiva"] });
  const q6AmericanYeshiva = await createFlowOption({ questionId: q6.id, label: "English-language / American yeshiva", optionSetKeys: ["boys"], weight: 2, tagSlugs: ["american-yeshiva"] });
  await createFlowOption({ questionId: q6.id, label: "Israeli midrasha", optionSetKeys: ["girls"], weight: 2, tagSlugs: ["israeli-midrasha"] });
  await createFlowOption({ questionId: q6.id, label: "American seminary", optionSetKeys: ["girls"], weight: 2, tagSlugs: ["american-seminary"] });
  await createFlowOption({ questionId: q6.id, label: "Religious mechina", weight: 2, tagSlugs: ["religious-mechina"] });
  await createFlowOption({ questionId: q6.id, label: "Non-religious / regular mechina", weight: 2, tagSlugs: ["regular-mechina"] });
  await createFlowOption({ questionId: q6.id, label: "Academic (college credit)", weight: 2, tagSlugs: ["academic-college-credit"] });
  await createFlowOption({ questionId: q6.id, label: "Experience / travel-focused", weight: 2, tagSlugs: ["experience-travel"] });
  console.log("seeded Q6 program-essence (flagship)");

  // ---- Q7: learning (CHALLENGE) --------------------------------------------
  const q7 = await createFlowQuestion({ prompt: "How do you feel about sitting and learning?", type: "CHALLENGE" });
  await createFlowOption({ questionId: q7.id, label: "I love it", weight: 1, tagSlugs: ["essence-spiritual-growth"] });
  await createFlowOption({ questionId: q7.id, label: "It's fine", weight: 0 });
  await createFlowOption({ questionId: q7.id, label: "School killed it for me", weight: -1, tagSlugs: ["essence-spiritual-growth"] });
  await createFlowOption({ questionId: q7.id, label: "I've honestly never tried it properly", weight: 0 });
  console.log("seeded Q7 learning");

  // ---- Q8-Q10: seeded RETIRED -- one click away in /admin/flow/questions,
  // per find-v2-question-spec.md's trim list ("hold Q8-Q10 for v2"). ---------
  const q8 = await createFlowQuestion({ prompt: "Single-gender or mixed program?", type: "CHALLENGE" });
  await updateFlowQuestion(q8.id, {
    showWhen: { v: 1, when: { type: "answerIn", questionKey: q3.key, optionKeys: [q3Mixed.key, q3NoPreference.key] } },
  });
  await createFlowOption({ questionId: q8.id, label: "Single gender", weight: 0 });
  await createFlowOption({ questionId: q8.id, label: "Mixed", weight: 0 });
  await createFlowOption({ questionId: q8.id, label: "Doesn't matter to me", weight: 0 });
  await updateFlowQuestion(q8.id, { status: "RETIRED" });
  console.log("seeded Q8 coed (RETIRED)");

  const q9 = await createFlowQuestion({ prompt: "Who do you want to be around?", type: "CHALLENGE" });
  await createFlowOption({ questionId: q9.id, label: "Mostly Anglos", weight: 1, tagSlugs: ["integration-low"] });
  await createFlowOption({ questionId: q9.id, label: "A real mix", weight: 1, tagSlugs: ["integration-medium"] });
  await createFlowOption({ questionId: q9.id, label: "Mostly Israelis", weight: 1, tagSlugs: ["integration-high"] });
  await createFlowOption({ questionId: q9.id, label: "No preference", weight: 0 });
  await updateFlowQuestion(q9.id, { status: "RETIRED" });
  console.log("seeded Q9 israeli-integration (RETIRED)");

  const q10 = await createFlowQuestion({ prompt: "Which comes first -- the Hebrew or the learning?", type: "TRADEOFF" });
  await updateFlowQuestion(q10.id, {
    showWhen: {
      v: 1,
      when: { type: "answerIn", questionKey: q6.key, optionKeys: [q6IsraeliYeshiva.key, q6AmericanYeshiva.key] },
    },
  });
  await createFlowOption({ questionId: q10.id, label: "Israeli yeshiva now, pick up Hebrew as I go", weight: 0 });
  await createFlowOption({ questionId: q10.id, label: "English-language yeshiva first, build the skills, then an Israeli one", weight: 0 });
  await createFlowOption({ questionId: q10.id, label: "I don't know the difference", weight: 0 });
  await updateFlowQuestion(q10.id, { status: "RETIRED" });
  console.log("seeded Q10 hebrew-vs-learning (RETIRED)");

  console.log("DONE -- Q1-Q7 ACTIVE, Q8-Q10 RETIRED");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
