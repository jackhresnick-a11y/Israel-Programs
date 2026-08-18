/**
 * Pure, Prisma-free translation layer between the row-based visual rule builder
 * (components/admin/flow/*) and the raw showWhen/optionSetRules JSON shapes defined in
 * lib/flowShared.ts. No import of lib/prisma anywhere in this file, so it's safe for a
 * "use client" component to import directly -- same split as lib/flowShared.ts itself.
 *
 * This module NEVER changes evaluation behavior: builderToCondition/builderToOptionSetRules
 * only ever produce shapes that lib/flowShared.ts's own schemas accept, and
 * evaluateFlowCondition (untouched, imported from lib/flowShared.ts) is the only function
 * that actually decides whether a question shows. This file is a UI convenience, not a
 * second implementation of the rule semantics.
 */
import { z } from "zod";
import {
  FLOW_RULE_VERSION,
  flowOptionSetRulesSchema,
  referencedQuestionKeys,
  type FlowCondition,
  type FlowConditionNode,
  type FlowOptionSetRules,
} from "@/lib/flowShared";

// ---------------------------------------------------------------------------
// The builder's own row-based shape -- deliberately shallower than the full
// FlowConditionNode grammar (see design rule 2 in the plan: nested groups, `not`
// wrapping a group, etc. stay raw-JSON-only, never modelled here).
// ---------------------------------------------------------------------------

export type BuilderOperator = "isOneOf" | "isNotOneOf" | "answered" | "notAnswered";

export type BuilderRow = {
  questionKey: string;
  operator: BuilderOperator;
  /** Only meaningful for isOneOf/isNotOneOf -- always [] for answered/notAnswered. */
  optionKeys: string[];
};

export type BuilderGroup = {
  /** Only observed when rows.length > 1 -- a single row always serializes to a bare
   * leaf node, never a 1-element all/any wrapper (see normalizeGroup). */
  combinator: "all" | "any";
  rows: BuilderRow[];
};

export type BuilderSetRule = { optionSetKey: string; row: BuilderRow };
export type BuilderSetRules = { default: string; rules: BuilderSetRule[] };

export type BuilderResult<T> = { ok: true; value: T } | { ok: false; reason: string };
export type JsonTextResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Renders a showWhen/optionSetRules column value as the raw-JSON textarea's text --
 * `null`/`undefined` (no rule) becomes an empty string, matched by parseJsonText's
 * empty-string -> null direction below. Shared by RuleEditor and
 * OptionSetRulesEditor so both fields treat "empty textarea" identically. */
export function jsonText(value: unknown): string {
  return value == null ? "" : JSON.stringify(value, null, 2);
}

/** The raw-JSON textarea's text -> the value a PATCH body should carry: empty text ->
 * null (clears the rule), valid JSON -> the parsed value, invalid JSON -> a parse
 * error reported to the caller rather than sent to the server (the server's own zod
 * schema is the real validator; this is just a fast "is this even JSON" check so a
 * typo doesn't round-trip for nothing). */
export function parseJsonText(text: string): JsonTextResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, error: "Not valid JSON" };
  }
}

const UNRECOGNIZED_SHAPE = "Not a recognized condition shape";
const TOO_COMPLEX = "This condition is too complex for the visual builder -- edit it as raw JSON.";

// ---------------------------------------------------------------------------
// A DELIBERATELY LENIENT shape-recognition schema, used only by conditionToBuilder/
// optionSetRulesToBuilder to decide "can the row builder DISPLAY this at all" -- NOT
// the same question as "is this valid enough to send to the server," which is still
// always the real, strict flowConditionSchema/flowOptionSetRulesSchema from
// lib/flowShared.ts (imported as-is, used directly by the editor components' Save
// gating). Without this split, adding a blank row (questionKey: "", no question
// chosen yet) would fail the strict schema's `keyString.min(1)` the instant it's
// added, kicking the whole field out of builder mode into raw mode mid-edit -- a
// real bug this exists to prevent. The two schemas otherwise recognize the exact
// same shapes (discriminated union on `type`), so a COMPLETE node parses identically
// under both -- the round-trip tests below only ever exercise complete nodes, and
// stay unaffected by this relaxation.
// ---------------------------------------------------------------------------

const draftKeyString = z.string().max(64);
const draftOptionKeys = z.array(draftKeyString).max(32);

const flowConditionNodeDraftSchema: z.ZodType<FlowConditionNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("answerIn"), questionKey: draftKeyString, optionKeys: draftOptionKeys }),
    z.object({ type: z.literal("answered"), questionKey: draftKeyString }),
    z.object({ type: z.literal("all"), of: z.array(flowConditionNodeDraftSchema).min(1).max(8) }),
    z.object({ type: z.literal("any"), of: z.array(flowConditionNodeDraftSchema).min(1).max(8) }),
    z.object({ type: z.literal("not"), of: flowConditionNodeDraftSchema }),
  ])
);

const flowConditionDraftSchema = z.object({ v: z.literal(FLOW_RULE_VERSION), when: flowConditionNodeDraftSchema });

const flowOptionSetRulesDraftSchema = z.object({
  v: z.literal(FLOW_RULE_VERSION),
  default: z.string().max(64),
  rules: z
    .array(z.object({ optionSetKey: z.string().max(64), when: flowConditionNodeDraftSchema }))
    .max(12),
});

// ---------------------------------------------------------------------------
// Question bank -- the minimal shape validation/description need, derived by the
// caller from the manager's live FlowQuestionRow[] prop. Options of any status are
// listed (retired options remain valid rule targets per lib/flow.ts's
// assertConditionReferencesValid: "a rule naming a currently-retired option is
// unreachable, not a typo").
// ---------------------------------------------------------------------------

export type BuilderOptionRef = { key: string; label: string; status: "ACTIVE" | "RETIRED" };
export type BuilderQuestionRef = { key: string; order: number; prompt: string; options: BuilderOptionRef[] };

// ---------------------------------------------------------------------------
// Node <-> row conversion
// ---------------------------------------------------------------------------

function nodeToRow(node: FlowConditionNode): BuilderRow | null {
  switch (node.type) {
    case "answerIn":
      return { questionKey: node.questionKey, operator: "isOneOf", optionKeys: node.optionKeys };
    case "answered":
      return { questionKey: node.questionKey, operator: "answered", optionKeys: [] };
    case "not": {
      const inner = node.of;
      if (inner.type === "answerIn") {
        return { questionKey: inner.questionKey, operator: "isNotOneOf", optionKeys: inner.optionKeys };
      }
      if (inner.type === "answered") {
        return { questionKey: inner.questionKey, operator: "notAnswered", optionKeys: [] };
      }
      return null; // not(all/any/not) -- not representable as one row
    }
    case "all":
    case "any":
      return null; // a group can't collapse into a single row
  }
}

function rowToNode(row: BuilderRow): FlowConditionNode {
  switch (row.operator) {
    case "isOneOf":
      return { type: "answerIn", questionKey: row.questionKey, optionKeys: row.optionKeys };
    case "isNotOneOf":
      return { type: "not", of: { type: "answerIn", questionKey: row.questionKey, optionKeys: row.optionKeys } };
    case "answered":
      return { type: "answered", questionKey: row.questionKey };
    case "notAnswered":
      return { type: "not", of: { type: "answered", questionKey: row.questionKey } };
  }
}

/** Forces the canonical shape a single-row group always serializes to (combinator
 * "all", no observable meaning at length <= 1) and dedupes/clears optionKeys per
 * operator -- the shape both directions of a round-trip test must agree on. */
export function normalizeGroup(group: BuilderGroup): BuilderGroup {
  const rows = group.rows.map((row) => ({
    ...row,
    optionKeys:
      row.operator === "isOneOf" || row.operator === "isNotOneOf" ? [...new Set(row.optionKeys)] : [],
  }));
  return { combinator: rows.length <= 1 ? "all" : group.combinator, rows };
}

/** Parses a showWhen column value into the builder's row shape. `null` (no
 * condition -- always shown) becomes an empty, modellable group so the UI can offer
 * "add a rule" from a blank state. Parses against the LENIENT draft schema (an
 * in-progress row with no question chosen yet must still round-trip so the UI
 * doesn't fall out of builder mode while it's being filled in -- see the draft
 * schema's doc comment); whether the result is complete enough to actually SAVE is
 * a separate question the caller answers via validateConditionBuilder against the
 * real flowConditionSchema. A value the draft schema can't recognize at all, or one
 * the row grammar can't express (nested groups, `not` wrapping a group, depth > 2),
 * reports `ok: false` with a reason meant for direct display -- the raw-JSON view
 * stays the only editor for that case. */
export function conditionToBuilder(showWhen: unknown): BuilderResult<BuilderGroup> {
  if (showWhen == null) return { ok: true, value: { combinator: "all", rows: [] } };
  const parsed = flowConditionDraftSchema.safeParse(showWhen);
  if (!parsed.success) return { ok: false, reason: UNRECOGNIZED_SHAPE };

  const node = parsed.data.when;
  if (node.type === "all" || node.type === "any") {
    const rows: BuilderRow[] = [];
    for (const child of node.of) {
      const row = nodeToRow(child);
      if (row === null) return { ok: false, reason: TOO_COMPLEX };
      rows.push(row);
    }
    return { ok: true, value: normalizeGroup({ combinator: node.type, rows }) };
  }
  const row = nodeToRow(node);
  if (row === null) return { ok: false, reason: TOO_COMPLEX };
  return { ok: true, value: normalizeGroup({ combinator: "all", rows: [row] }) };
}

/** Builds a showWhen value from the builder's group -- null (clears the field) when
 * there are no rows, a bare leaf for exactly one row, else an all/any wrapper. Output
 * is always accepted by flowConditionSchema; this function never itself validates
 * question/option REFERENCES (see validateConditionBuilder) -- it only assembles a
 * structurally valid tree from whatever rows are currently staged, even mid-edit. */
export function builderToCondition(group: BuilderGroup): FlowCondition | null {
  const normalized = normalizeGroup(group);
  if (normalized.rows.length === 0) return null;
  const nodes = normalized.rows.map(rowToNode);
  const when: FlowConditionNode =
    nodes.length === 1 ? nodes[0] : { type: normalized.combinator, of: nodes };
  return { v: FLOW_RULE_VERSION, when };
}

/** Same modelling contract as conditionToBuilder, for the optionSetRules column --
 * each rule's `when` must itself be row-representable (same TOO_COMPLEX cutoff), and
 * `default` carries through verbatim (structural validity, e.g. non-empty, is
 * enforced by validateOptionSetRulesBuilder, not here). Parses against the lenient
 * draft schema for the same "don't fall out of builder mode mid-edit" reason as
 * conditionToBuilder above. */
export function optionSetRulesToBuilder(optionSetRules: unknown): BuilderResult<BuilderSetRules> {
  if (optionSetRules == null) return { ok: true, value: { default: "", rules: [] } };
  const parsed = flowOptionSetRulesDraftSchema.safeParse(optionSetRules);
  if (!parsed.success) return { ok: false, reason: UNRECOGNIZED_SHAPE };

  const rules: BuilderSetRule[] = [];
  for (const rule of parsed.data.rules) {
    const row = nodeToRow(rule.when);
    if (row === null) return { ok: false, reason: TOO_COMPLEX };
    rules.push({ optionSetKey: rule.optionSetKey, row });
  }
  return { ok: true, value: { default: parsed.data.default, rules } };
}

/** Builds an optionSetRules value from the builder's rules -- null (clears the
 * field) only when BOTH the default and the rule list are empty, since
 * flowOptionSetRulesSchema requires a non-empty `default` the instant any rule
 * exists (see validateOptionSetRulesBuilder for surfacing that as a blocking error
 * rather than silently dropping rules). */
export function builderToOptionSetRules(rules: BuilderSetRules): FlowOptionSetRules | null {
  const trimmedDefault = rules.default.trim();
  if (!trimmedDefault && rules.rules.length === 0) return null;
  return {
    v: FLOW_RULE_VERSION,
    default: trimmedDefault,
    rules: rules.rules.map((r) => ({ optionSetKey: r.optionSetKey, when: rowToNode(r.row) })),
  };
}

// ---------------------------------------------------------------------------
// Reference validation -- mirrors lib/flow.ts's assertConditionReferencesValid
// exactly (that function is the server-side gate; this must be neither laxer nor
// stricter, or a rule that looks valid in the builder could still 400 on save, or
// vice versa a rule the builder blocks could actually have been fine).
// ---------------------------------------------------------------------------

function validateRow(
  row: BuilderRow,
  rowLabel: string,
  self: { key: string; order: number },
  bank: BuilderQuestionRef[]
): string[] {
  const problems: string[] = [];
  if (!row.questionKey) {
    problems.push(`${rowLabel}: choose a question`);
    return problems;
  }
  const target = bank.find((q) => q.key === row.questionKey);
  if (!target) {
    problems.push(`${rowLabel}: references unknown question "${row.questionKey}"`);
  } else if (row.questionKey === self.key) {
    problems.push(`${rowLabel}: references itself, which can never be answered yet`);
  } else if (target.order >= self.order) {
    problems.push(`${rowLabel}: references "${row.questionKey}", which isn't ordered before this question`);
  }
  if (row.operator === "isOneOf" || row.operator === "isNotOneOf") {
    if (row.optionKeys.length === 0) {
      problems.push(`${rowLabel}: choose at least one option`);
    } else if (target) {
      const validKeys = new Set(target.options.map((o) => o.key));
      const unknown = row.optionKeys.filter((k) => !validKeys.has(k));
      if (unknown.length > 0) {
        problems.push(
          `${rowLabel}: references unknown option key(s) [${unknown.join(", ")}] on question "${row.questionKey}"`
        );
      }
    }
  }
  return problems;
}

/** Every problem that would make builderToCondition's output rejected by
 * lib/flow.ts's assertConditionReferencesValid, worded for inline display next to
 * the offending row. Empty array = safe to save. */
export function validateConditionBuilder(
  group: BuilderGroup,
  self: { key: string; order: number },
  bank: BuilderQuestionRef[]
): string[] {
  const problems: string[] = [];
  group.rows.forEach((row, i) => {
    problems.push(...validateRow(row, `Row ${i + 1}`, self, bank));
  });
  return problems;
}

/** Same idea for optionSetRules: each rule's row is validated like a condition row,
 * plus the schema-level requirement that `default` is non-empty whenever any rule
 * exists (flowOptionSetRulesSchema's `default: z.string().min(1)`). */
export function validateOptionSetRulesBuilder(
  rules: BuilderSetRules,
  self: { key: string; order: number },
  bank: BuilderQuestionRef[]
): string[] {
  const problems: string[] = [];
  if (rules.rules.length > 0 && !rules.default.trim()) {
    problems.push("Default option set is required when any rule is set");
  }
  rules.rules.forEach((rule, i) => {
    const label = `Rule ${i + 1} (→ ${rule.optionSetKey || "(no set chosen)"})`;
    if (!rule.optionSetKey.trim()) problems.push(`${label}: choose an option set`);
    problems.push(...validateRow(rule.row, label, self, bank));
  });
  return problems;
}

/** Every `answerIn` leaf inside a condition, as {questionKey, optionKeys} pairs --
 * mirrors lib/flow.ts's private collectAnswerInLeaves exactly (that function isn't
 * exported, so this is a deliberate parallel copy, not a duplicate export). */
function collectAnswerInLeaves(node: FlowConditionNode): { questionKey: string; optionKeys: string[] }[] {
  switch (node.type) {
    case "answerIn":
      return [{ questionKey: node.questionKey, optionKeys: node.optionKeys }];
    case "answered":
      return [];
    case "not":
      return collectAnswerInLeaves(node.of);
    case "all":
    case "any":
      return node.of.flatMap(collectAnswerInLeaves);
  }
}

/** Reference validation for a condition the row builder CAN'T model (nested groups,
 * `not` wrapping a group, etc.) -- the raw-JSON view still deserves the same
 * preemptive "before save" check the builder gets, so this walks the full
 * FlowConditionNode tree directly (via referencedQuestionKeys/collectAnswerInLeaves,
 * the same helpers lib/flow.ts's assertConditionReferencesValid is built from)
 * instead of going through BuilderRow at all. */
export function validateRawCondition(
  condition: FlowCondition,
  self: { key: string; order: number },
  bank: BuilderQuestionRef[]
): string[] {
  const problems: string[] = [];
  const keys = [...new Set(referencedQuestionKeys(condition.when))];
  for (const key of keys) {
    const target = bank.find((q) => q.key === key);
    if (!target) {
      problems.push(`references unknown question "${key}"`);
    } else if (key === self.key) {
      problems.push(`references itself, which can never be answered yet`);
    } else if (target.order >= self.order) {
      problems.push(`references "${key}", which isn't ordered before this question`);
    }
  }
  for (const { questionKey, optionKeys } of collectAnswerInLeaves(condition.when)) {
    const target = bank.find((q) => q.key === questionKey);
    if (!target) continue; // already reported as an unknown-question problem above
    const validKeys = new Set(target.options.map((o) => o.key));
    const unknown = optionKeys.filter((k) => !validKeys.has(k));
    if (unknown.length > 0) {
      problems.push(`references unknown option key(s) [${unknown.join(", ")}] on question "${questionKey}"`);
    }
  }
  return problems;
}

/** Same idea for optionSetRules -- validates every rule's `when` against the live
 * question/option bank regardless of whether the row builder can model it. */
export function validateRawOptionSetRules(
  rules: FlowOptionSetRules,
  self: { key: string; order: number },
  bank: BuilderQuestionRef[]
): string[] {
  return rules.rules.flatMap((rule) =>
    validateRawCondition({ v: FLOW_RULE_VERSION, when: rule.when }, self, bank).map(
      (problem) => `Rule (→ ${rule.optionSetKey}): ${problem}`
    )
  );
}

// ---------------------------------------------------------------------------
// Plain-English summaries (scope 3) -- read-only rendering of real prompt/label
// text already on the question/option rows; never creates or rewords content.
// ---------------------------------------------------------------------------

function questionLabel(questionKey: string, bank: BuilderQuestionRef[]): string {
  const q = bank.find((b) => b.key === questionKey);
  return q ? `'${q.prompt}'` : `unknown question "${questionKey}"`;
}

function optionLabels(optionKeys: string[], questionKey: string, bank: BuilderQuestionRef[]): string {
  const q = bank.find((b) => b.key === questionKey);
  return optionKeys
    .map((key) => {
      const opt = q?.options.find((o) => o.key === key);
      return opt ? opt.label : `unknown option "${key}"`;
    })
    .join(" or ");
}

export function describeRow(row: BuilderRow, bank: BuilderQuestionRef[]): string {
  const qLabel = questionLabel(row.questionKey, bank);
  switch (row.operator) {
    case "isOneOf":
      return `${qLabel} is ${optionLabels(row.optionKeys, row.questionKey, bank)}`;
    case "isNotOneOf":
      return `${qLabel} is not ${optionLabels(row.optionKeys, row.questionKey, bank)}`;
    case "answered":
      return `${qLabel} is answered`;
    case "notAnswered":
      return `${qLabel} is not answered`;
  }
}

/** Empty string when there's nothing to show (no rows -- always shown), so callers
 * can render nothing rather than an empty "Shown when" line. */
export function describeGroup(group: BuilderGroup, bank: BuilderQuestionRef[]): string {
  if (group.rows.length === 0) return "";
  const joiner = group.combinator === "any" ? " OR " : " AND ";
  return group.rows.map((row) => describeRow(row, bank)).join(joiner);
}

/** One line per rule ("<condition> -> option set: <key>"), plus a trailing default
 * line when set. Empty array when there's nothing configured. */
export function describeSetRules(rules: BuilderSetRules, bank: BuilderQuestionRef[]): string[] {
  const lines = rules.rules.map((rule) => `${describeRow(rule.row, bank)} → option set: ${rule.optionSetKey}`);
  if (rules.default.trim()) lines.push(`Otherwise → option set: ${rules.default}`);
  return lines;
}

// ---------------------------------------------------------------------------
// Option-set key sourcing for the option-set picker -- real data only, never free
// text: the distinct union of every option's declared optionSetKeys, the question's
// defaultOptionSetKey, and any key already named by an existing rule.
// ---------------------------------------------------------------------------

export function collectOptionSetKeys(question: {
  defaultOptionSetKey: string | null;
  optionSetRules: unknown;
  options: { optionSetKeys: string[] }[];
}): string[] {
  const keys = new Set<string>();
  for (const option of question.options) {
    for (const key of option.optionSetKeys) keys.add(key);
  }
  if (question.defaultOptionSetKey) keys.add(question.defaultOptionSetKey);
  const parsed = flowOptionSetRulesSchema.safeParse(question.optionSetRules);
  if (parsed.success) {
    if (parsed.data.default) keys.add(parsed.data.default);
    for (const rule of parsed.data.rules) keys.add(rule.optionSetKey);
  }
  return [...keys].sort();
}
