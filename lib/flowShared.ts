/**
 * Pure, Prisma-free core of the /match challenge flow (find-v2-question-spec.md) --
 * the show-condition rule format, option-set resolution, and the navigation logic
 * (resolveFlow) that Back/Skip/Submit and the admin live preview all run through.
 * No import of lib/prisma anywhere in this file, so it's safe for a "use client"
 * component to import directly -- same split as lib/pollShared.ts / lib/finderTargets.ts
 * / lib/homeVideoConfig.ts. lib/flow.ts is the Prisma-backed sibling that fetches rows
 * into the DTOs below and re-exports these symbols for server callers.
 */
import { z } from "zod";

export const FLOW_RULE_VERSION = 1;

// ---------------------------------------------------------------------------
// DTOs -- the JSON-shaped view of FlowQuestion/FlowOption every pure function below
// operates on. lib/flow.ts is responsible for producing these from Prisma rows.
// ---------------------------------------------------------------------------

export type FlowQuestionKind = "FILTER" | "CHALLENGE" | "TRADEOFF";
export type FlowOptionMatchMode = "WEIGHT" | "REQUIRE";
export type FlowLifecycleStatus = "ACTIVE" | "RETIRED";

export type FlowOptionDTO = {
  id: string;
  questionId: string;
  key: string;
  label: string;
  rationale: string | null;
  order: number;
  /** Empty = belongs to every option set (see resolveOptionSetKey/optionsForSet). */
  optionSetKeys: string[];
  tagSlugs: string[];
  durationValues: string[];
  matchMode: FlowOptionMatchMode;
  weight: number;
  requireIncludesUntagged: boolean;
  status: FlowLifecycleStatus;
};

export type FlowQuestionDTO = {
  id: string;
  key: string;
  order: number;
  type: FlowQuestionKind;
  prompt: string;
  helpText: string | null;
  skippable: boolean;
  /** Raw Json column value -- parsed lazily by shouldShowQuestion, never trusted
   * pre-validated (a hand-edited DB row can carry anything). */
  showWhen: unknown;
  optionSetRules: unknown;
  defaultOptionSetKey: string | null;
  version: number;
  status: FlowLifecycleStatus;
  options: FlowOptionDTO[];
};

// ---------------------------------------------------------------------------
// The show-condition rule format
// ---------------------------------------------------------------------------

/** questionKey -> the FlowOption.key values selected for it. A key absent from this
 * map, or present with an empty array, means unanswered/skipped -- both read as
 * "false" by answerIn and "true" by not(answerIn(...)) would therefore always be
 * true for an unanswered question, which is why `answered` exists as its own leaf
 * (see design rule 2 below). */
export type FlowAnswers = Record<string, string[]>;

export type FlowConditionNode =
  | { type: "answerIn"; questionKey: string; optionKeys: string[] }
  | { type: "answered"; questionKey: string }
  | { type: "all"; of: FlowConditionNode[] }
  | { type: "any"; of: FlowConditionNode[] }
  | { type: "not"; of: FlowConditionNode };

const keyString = z.string().trim().min(1).max(64);

export const flowConditionNodeSchema: z.ZodType<FlowConditionNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("answerIn"),
      questionKey: keyString,
      optionKeys: z.array(keyString).min(1).max(32),
    }),
    z.object({ type: z.literal("answered"), questionKey: keyString }),
    z.object({ type: z.literal("all"), of: z.array(flowConditionNodeSchema).min(1).max(8) }),
    z.object({ type: z.literal("any"), of: z.array(flowConditionNodeSchema).min(1).max(8) }),
    z.object({ type: z.literal("not"), of: flowConditionNodeSchema }),
  ])
);

/** Depth cap so a hand-edited DB row can't blow the evaluator's call stack. */
const MAX_RULE_DEPTH = 4;

function nodeDepth(node: FlowConditionNode): number {
  switch (node.type) {
    case "answerIn":
    case "answered":
      return 1;
    case "not":
      return 1 + nodeDepth(node.of);
    case "all":
    case "any":
      return 1 + Math.max(...node.of.map(nodeDepth));
  }
}

export const flowConditionSchema = z
  .object({ v: z.literal(FLOW_RULE_VERSION), when: flowConditionNodeSchema })
  .refine((rule) => nodeDepth(rule.when) <= MAX_RULE_DEPTH, {
    message: `Condition nests deeper than ${MAX_RULE_DEPTH} levels`,
    path: ["when"],
  });

export type FlowCondition = z.infer<typeof flowConditionSchema>;

export function evaluateFlowCondition(node: FlowConditionNode, answers: FlowAnswers): boolean {
  switch (node.type) {
    case "answerIn": {
      const selected = answers[node.questionKey];
      return !!selected && selected.some((k) => node.optionKeys.includes(k));
    }
    case "answered": {
      const selected = answers[node.questionKey];
      return !!selected && selected.length > 0;
    }
    case "all":
      return node.of.every((child) => evaluateFlowCondition(child, answers));
    case "any":
      return node.of.some((child) => evaluateFlowCondition(child, answers));
    case "not":
      return !evaluateFlowCondition(node.of, answers);
  }
}

/** Tolerant read: NULL means "always show", and an unparseable rule ALSO means
 * "always show" -- fail OPEN, never silently drop a question from the flow. A
 * question that vanishes is a bug nobody notices for weeks; an extra one is
 * obvious. Write paths (lib/flow.ts) reject a bad rule with a 400, so a malformed
 * rule can only ever arrive here via a direct DB edit. */
export function shouldShowQuestion(showWhen: unknown, answers: FlowAnswers): boolean {
  if (showWhen == null) return true;
  const parsed = flowConditionSchema.safeParse(showWhen);
  if (!parsed.success) return true;
  return evaluateFlowCondition(parsed.data.when, answers);
}

/** Every question key a rule depends on -- used by lib/flow.ts at WRITE time to
 * reject a rule naming a question that doesn't exist or is ordered AFTER the
 * question/trigger carrying the rule (which can never be true and would silently
 * hide the question forever), and by the admin UI to explain a rule in plain
 * language. */
export function referencedQuestionKeys(node: FlowConditionNode): string[] {
  switch (node.type) {
    case "answerIn":
    case "answered":
      return [node.questionKey];
    case "not":
      return referencedQuestionKeys(node.of);
    case "all":
    case "any":
      return node.of.flatMap(referencedQuestionKeys);
  }
}

// ---------------------------------------------------------------------------
// Option-set resolution (Q6's three option sets, keyed off the gender answer)
// ---------------------------------------------------------------------------

export type FlowOptionSetRule = { optionSetKey: string; when: FlowConditionNode };
export type FlowOptionSetRules = { v: 1; default: string; rules: FlowOptionSetRule[] };

export const flowOptionSetRulesSchema = z.object({
  v: z.literal(FLOW_RULE_VERSION),
  default: z.string().trim().min(1).max(64),
  rules: z
    .array(z.object({ optionSetKey: z.string().trim().min(1).max(64), when: flowConditionNodeSchema }))
    .max(12),
});

/** First matching rule wins; `defaultKey` (the question's own defaultOptionSetKey
 * column) is the fallback when optionSetRules is absent/unparseable/no rule matches
 * -- including when the question the rules key off was itself skipped or hidden.
 * Q6 defaults to "mixed": a respondent who skipped gender gets the shorter, safer
 * list rather than an empty question. */
export function resolveOptionSetKey(
  optionSetRules: unknown,
  defaultKey: string | null,
  answers: FlowAnswers
): string {
  const parsed = flowOptionSetRulesSchema.safeParse(optionSetRules);
  if (!parsed.success) return defaultKey ?? "";
  for (const rule of parsed.data.rules) {
    if (evaluateFlowCondition(rule.when, answers)) return rule.optionSetKey;
  }
  return parsed.data.default ?? defaultKey ?? "";
}

/** An option belongs to a resolved set if it names it, or if it names NO set at all
 * (empty optionSetKeys = universal -- Q6's four shared options are authored once). */
export function optionsForSet<T extends { optionSetKeys: string[] }>(options: T[], setKey: string): T[] {
  return options.filter((o) => o.optionSetKeys.length === 0 || o.optionSetKeys.includes(setKey));
}

// ---------------------------------------------------------------------------
// Answer-state: parsing/serializing the ?a= URL param and the navigation core
// ---------------------------------------------------------------------------

/** questionKey -> selected option keys, or `null` for an EXPLICIT skip (distinct
 * from a question not yet reached, which is simply absent from the map). Both
 * "skipped" and "not yet reached" collapse to the same "unanswered" reading for
 * evaluateFlowCondition/scoring purposes (see toConditionAnswers below) -- the
 * distinction only matters for navigation (has this question been passed?). */
export type FlowAnswerState = Map<string, string[] | null>;

const ANSWER_ENTRY_SEP = ",";
const ANSWER_KV_SEP = ":";
const SKIP_SENTINEL = "-";
/** Marks a question answered with an EMPTY option list -- distinct from a skip
 * (null). This is how a video-only interstitial (zero FlowOption rows, e.g. the Q2
 * opener) records "seen and acknowledged" rather than "skipped." `_` rather than a
 * punctuation character with URL-encoding baggage (e.g. `+`, which
 * application/x-www-form-urlencoded treats as a literal space in some contexts) --
 * slugify's strict mode never emits `_` in a real option key, so there's no
 * collision risk. */
const ACK_SENTINEL = "_";

/** Tolerant parse of the `?a=` param: a malformed entry (no separator, empty key)
 * is dropped, never thrown -- same posture as buildProgramsHref dropping a stale
 * tag slug rather than 500ing the page. Single-select only today (one option key
 * per entry); a future multi-select question is a grammar extension here, not a
 * migration -- see FlowResponse.optionKeys's doc comment in schema.prisma. */
export function parseAnswerState(raw: string | null | undefined): FlowAnswerState {
  const state: FlowAnswerState = new Map();
  if (!raw) return state;
  for (const entry of raw.split(ANSWER_ENTRY_SEP)) {
    if (!entry) continue;
    const sepIndex = entry.indexOf(ANSWER_KV_SEP);
    if (sepIndex <= 0) continue;
    const key = entry.slice(0, sepIndex);
    const value = entry.slice(sepIndex + 1);
    if (value === SKIP_SENTINEL) state.set(key, null);
    else if (value === ACK_SENTINEL) state.set(key, []);
    else if (value) state.set(key, [value]);
  }
  return state;
}

/** Every non-null entry must round-trip, INCLUDING an empty array -- dropping it
 * (e.g. via a naive `value.length > 0` guard) would silently un-acknowledge an
 * interstitial the moment its URL gets serialized again, making it reappear
 * forever. See ACK_SENTINEL. */
export function serializeAnswerState(state: FlowAnswerState): string {
  const parts: string[] = [];
  for (const [key, value] of state) {
    if (value === null) parts.push(`${key}${ANSWER_KV_SEP}${SKIP_SENTINEL}`);
    else if (value.length === 0) parts.push(`${key}${ANSWER_KV_SEP}${ACK_SENTINEL}`);
    else parts.push(`${key}${ANSWER_KV_SEP}${value[0]}`);
  }
  return parts.join(ANSWER_ENTRY_SEP);
}

/** Immutable update -- FlowStep.tsx calls this to fold one new answer/skip into the
 * state before pushing the next URL. `optionKeys: null` records an explicit skip. */
export function withAnswer(
  state: FlowAnswerState,
  questionKey: string,
  optionKeys: string[] | null
): FlowAnswerState {
  const next = new Map(state);
  next.set(questionKey, optionKeys);
  return next;
}

/** Projects answer state down to the shape evaluateFlowCondition/scoring consume:
 * a skip or an empty selection is simply absent, per design rule 2 above. */
export function toConditionAnswers(state: FlowAnswerState): FlowAnswers {
  const answers: FlowAnswers = {};
  for (const [key, value] of state) {
    if (value && value.length > 0) answers[key] = value;
  }
  return answers;
}

/** One forward pass over every question (in `order`): a question is visible only if
 * its showWhen passes against everything visible-and-answered SO FAR. A hidden
 * question's answer is never folded into conditionAnswers, so a condition can never
 * observe an answer to a question the respondent never actually saw.
 *
 * Also catches a narrower staleness case than plain visibility: Q6 keys its option
 * SET (not its visibility) off an earlier answer -- "boys"/"girls"/"mixed". Back up,
 * change gender, and Q6 stays visible, but a previously-selected option like
 * `israeli-yeshiva` may no longer belong to the newly-resolved set. Such an answer is
 * flagged in `staleKeys` (so pruneAnswerState drops it and the question gets
 * re-asked) and deliberately excluded from conditionAnswers -- a later condition
 * must never observe an answer the current path no longer considers valid. Only
 * meaningful for a question that actually carries options (an interstitial's
 * acknowledgment is always `[]`, which the `stored.length === 0` guard already
 * short-circuits). */
function evaluateVisibility(
  questions: FlowQuestionDTO[],
  state: FlowAnswerState
): { visible: FlowQuestionDTO[]; conditionAnswers: FlowAnswers; staleKeys: Set<string> } {
  const visible: FlowQuestionDTO[] = [];
  const conditionAnswers: FlowAnswers = {};
  const staleKeys = new Set<string>();
  for (const q of questions) {
    if (!shouldShowQuestion(q.showWhen, conditionAnswers)) continue;
    visible.push(q);
    const stored = state.get(q.key);
    if (!stored || stored.length === 0) continue;
    if (q.options.length > 0) {
      const setKey = resolveOptionSetKey(q.optionSetRules, q.defaultOptionSetKey, conditionAnswers);
      const validKeys = new Set(
        optionsForSet(
          q.options.filter((o) => o.status === "ACTIVE"),
          setKey
        ).map((o) => o.key)
      );
      if (!stored.every((k) => validKeys.has(k))) {
        staleKeys.add(q.key);
        continue;
      }
    }
    conditionAnswers[q.key] = stored;
  }
  return { visible, conditionAnswers, staleKeys };
}

/** Drops any answer-state entry for a question that isn't (or is no longer) visible,
 * or whose selection is stale under the question's currently-resolved option set (see
 * evaluateVisibility). Not cosmetic: back up, change an earlier answer, and a
 * stranded answer to a question that no longer appears -- or no longer means the same
 * thing -- must stop weighting the results and must stop blocking navigation past
 * where it used to sit. */
function pruneAnswerState(state: FlowAnswerState, visible: FlowQuestionDTO[], staleKeys: Set<string>): FlowAnswerState {
  const visibleKeys = new Set(visible.map((q) => q.key));
  const pruned: FlowAnswerState = new Map();
  for (const [key, value] of state) {
    if (visibleKeys.has(key) && !staleKeys.has(key)) pruned.set(key, value);
  }
  return pruned;
}

function resolveCurrentQuestion(
  visible: FlowQuestionDTO[],
  prunedState: FlowAnswerState,
  requestedKey: string | null
): FlowQuestionDTO | null {
  if (requestedKey) {
    const found = visible.find((q) => q.key === requestedKey);
    if (found) return found;
  }
  // No explicit/valid ?q= -- resume at the first visible question with no entry yet.
  return visible.find((q) => !prunedState.has(q.key)) ?? null;
}

/** The previous VISIBLE question relative to `current` (or, when current is null --
 * the submit/review screen -- the last visible question), for the Back link. `null`
 * when there's nowhere to go back to. */
function resolvePrevKey(visible: FlowQuestionDTO[], current: FlowQuestionDTO | null): string | null {
  const idx = current ? visible.findIndex((q) => q.key === current.key) : visible.length;
  if (idx <= 0) return null;
  return visible[idx - 1].key;
}

export type ResolvedFlow = {
  /** Every question whose show-condition currently passes, in order. */
  visible: FlowQuestionDTO[];
  /** The question to render now, or null when every visible question has an entry
   * in `state` -- the explicit submit/review screen. There is no auto-advance. */
  current: FlowQuestionDTO | null;
  /** `current`'s options, already narrowed to the resolved option set. Empty for a
   * video-only interstitial question (the Q2 opener has zero FlowOption rows). */
  visibleOptions: FlowOptionDTO[];
  prevKey: string | null;
  /** Answer state, pruned to only the keys of `visible` questions. */
  state: FlowAnswerState;
  conditionAnswers: FlowAnswers;
};

/** The one function Back, Skip, hidden questions, and the admin preview all run
 * through. Pure: same (questions, state, requestedKey) always produces the same
 * result, which is what makes the admin preview panel able to render the REAL
 * FlowStep component against a locally-held answer map with zero server round trip. */
export function resolveFlow(
  questions: FlowQuestionDTO[],
  rawState: FlowAnswerState,
  requestedKey: string | null
): ResolvedFlow {
  const { visible, conditionAnswers, staleKeys } = evaluateVisibility(questions, rawState);
  const state = pruneAnswerState(rawState, visible, staleKeys);
  const current = resolveCurrentQuestion(visible, state, requestedKey);
  const visibleOptions = current
    ? optionsForSet(
        current.options.filter((o) => o.status === "ACTIVE"),
        resolveOptionSetKey(current.optionSetRules, current.defaultOptionSetKey, conditionAnswers)
      )
    : [];
  const prevKey = resolvePrevKey(visible, current);
  return { visible, current, visibleOptions, prevKey, state, conditionAnswers };
}

/** Builds a `/match` or `/match/results` href carrying the current question + answer
 * state (+ session id, when known) -- the one place that URL shape is assembled, so
 * FlowStep's option links, the review screen's Edit links, and the results page's
 * "back into the flow" links can never drift from what resolveFlow expects to parse
 * back. `sessionId` is a plain opaque string here -- this module never validates or
 * even knows what a FlowSession is, that's lib/flowRun.ts's job. */
export function buildMatchHref(
  base: "/match" | "/match/results",
  questionKey: string | null,
  state: FlowAnswerState,
  sessionId?: string
): string {
  const params = new URLSearchParams();
  const a = serializeAnswerState(state);
  if (a) params.set("a", a);
  if (questionKey) params.set("q", questionKey);
  if (sessionId) params.set("s", sessionId);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// ---------------------------------------------------------------------------
// Admin preview support (Step 7) -- POST /api/admin/flow/preview's JSON-safe
// answer-state encoding, and applying not-yet-saved matchMode edits before
// re-running the ranking pipeline. Both pure so lib/flowRank.test.ts-style
// coverage doesn't need a DB.
// ---------------------------------------------------------------------------

/** FlowAnswerState (a Map, not JSON-serializable) <-> the plain object shape a
 * POST body carries. Distinct from parseAnswerState/serializeAnswerState above,
 * which round-trip through the `?a=` URL string format instead -- the admin
 * preview panel already holds a live Map in React state, so it sends/receives
 * the Map's own shape directly rather than going through the URL encoding. */
export function answerStateToRecord(state: FlowAnswerState): Record<string, string[] | null> {
  return Object.fromEntries(state);
}

export function recordToAnswerState(record: Record<string, string[] | null>): FlowAnswerState {
  return new Map(Object.entries(record));
}

/** Returns `questions` with any option in `overrides` given its overridden
 * matchMode -- used to preview "if this option's hard-eliminator flag changed,
 * what would survive" against not-yet-saved admin edits, without writing
 * anything. Identity-returns `questions` when there's nothing to override, so a
 * caller with no pending edits pays no allocation cost. */
export function applyOptionOverrides(
  questions: FlowQuestionDTO[],
  overrides: Map<string, FlowOptionMatchMode>
): FlowQuestionDTO[] {
  if (overrides.size === 0) return questions;
  return questions.map((q) => ({
    ...q,
    options: q.options.map((o) => (overrides.has(o.id) ? { ...o, matchMode: overrides.get(o.id)! } : o)),
  }));
}
