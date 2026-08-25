"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import ConditionRow from "./ConditionRow";
import {
  conditionToBuilder,
  builderToCondition,
  validateConditionBuilder,
  validateRawCondition,
  describeGroup,
  jsonText,
  parseJsonText,
  type BuilderGroup,
  type BuilderQuestionRef,
  type BuilderRow,
} from "@/lib/flowRuleBuilder";
import { flowConditionSchema } from "@/lib/flowShared";

const EMPTY_GROUP: BuilderGroup = { combinator: "all", rows: [] };
const PLACEHOLDER =
  '{"v":1,"when":{"type":"answerIn","questionKey":"life-stage","optionKeys":["working"]}}';

/**
 * The show-condition (showWhen) editor: a row-based visual builder with a raw-JSON
 * fallback, replacing the bare textarea. Raw text is the single source of truth held
 * in this component's state (same "compare to the prop, not a stashed baseline" dirty
 * check as the old ShowWhenEditor) -- switching to the builder view never mutates
 * state on its own; only an actual row edit rewrites `text` via builderToCondition, so
 * "raw is authoritative on save" holds by construction. A condition the row grammar
 * can't model (nested groups, `not` wrapping a group -- see lib/flowRuleBuilder.ts's
 * design note) locks the view to raw JSON rather than risking losing the shape.
 *
 * Shared by both FlowQuestion.showWhen and FlowOption.showWhen: `question` is always
 * the OWNING question (a question editing its own rule, or an option's PARENT
 * question) -- candidates/self are derived from its key/order either way, which is
 * exactly the "an option may only reference a question ordered before its parent"
 * rule. `endpoint`/`fieldId` default to the question-level PATCH target; the
 * option-level call site overrides both to point at the option's own id instead.
 */
export default function RuleEditor({
  question,
  bank,
  onSaved,
  api,
  errorMessage,
  showWhen,
  endpoint,
  fieldId,
  fieldLabel = "Show-condition (empty = always shown)",
  saveLabel = "Save show-condition",
  savedMessage = "Show-condition saved",
}: {
  question: { id: string; key: string; order: number; showWhen: unknown };
  bank: BuilderQuestionRef[];
  onSaved: () => void;
  api: (url: string, method: string, body?: object) => Promise<unknown>;
  errorMessage: (err: unknown, fallback: string) => string;
  /** The rule being edited -- defaults to `question.showWhen` for the question-level
   * call site; the option-level call site passes the OPTION's showWhen instead. */
  showWhen?: unknown;
  /** PATCH target -- defaults to the question's own route. */
  endpoint?: string;
  /** data-testid suffix -- defaults to `question.id`. */
  fieldId?: string;
  fieldLabel?: string;
  saveLabel?: string;
  savedMessage?: string;
}) {
  const initialShowWhen = showWhen !== undefined ? showWhen : question.showWhen;
  const patchEndpoint = endpoint ?? `/api/admin/flow/questions/${question.id}`;
  const testId = fieldId ?? question.id;
  const { toast } = useToast();
  const [text, setText] = useState(jsonText(initialShowWhen));
  const [mode, setMode] = useState<"builder" | "raw">("builder");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const parsed = parseJsonText(text);
  const dirty = !parsed.ok || JSON.stringify(parsed.value) !== JSON.stringify(initialShowWhen ?? null);

  const candidates = bank.filter((q) => q.order < question.order && q.key !== question.key);
  const self = { key: question.key, order: question.order };

  const builderResult = parsed.ok ? conditionToBuilder(parsed.value) : null;
  const canUseBuilder = builderResult?.ok ?? false;
  const structural = parsed.ok && parsed.value != null ? flowConditionSchema.safeParse(parsed.value) : null;

  // Two validation paths depending on whether the CURRENT text is builder-modellable:
  // in builder mode, per-row messages ("Row 1: choose a question") from
  // validateConditionBuilder against the in-progress BuilderGroup -- friendlier, and
  // correct even mid-edit (an empty questionKey fails the strict schema but isn't a
  // "shape" problem, see conditionToBuilder's doc comment). Otherwise (raw-only edits,
  // or a value the row grammar can't express) validateRawCondition walks the full
  // FlowConditionNode tree directly, so raw edits get the same preemptive check.
  const builderProblems =
    builderResult && builderResult.ok ? validateConditionBuilder(builderResult.value, self, bank) : [];
  const referenceProblems =
    !canUseBuilder && parsed.ok && structural?.success ? validateRawCondition(structural.data, self, bank) : [];

  const structurallyValid = !parsed.ok || parsed.value == null || (structural?.success ?? false);
  const canSave =
    parsed.ok &&
    dirty &&
    !saving &&
    structurallyValid &&
    referenceProblems.length === 0 &&
    builderProblems.length === 0;

  function handleGroupChange(nextGroup: BuilderGroup) {
    setText(jsonText(builderToCondition(nextGroup)));
  }

  function updateRow(index: number, group: BuilderGroup, nextRow: BuilderRow) {
    const rows = [...group.rows];
    rows[index] = nextRow;
    handleGroupChange({ ...group, rows });
  }

  function removeRow(index: number, group: BuilderGroup) {
    handleGroupChange({ ...group, rows: group.rows.filter((_, i) => i !== index) });
  }

  function addRow(group: BuilderGroup) {
    handleGroupChange({
      ...group,
      rows: [...group.rows, { questionKey: "", operator: "answered", optionKeys: [] }],
    });
  }

  async function handleSave() {
    if (!parsed.ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api(patchEndpoint, "PATCH", { showWhen: parsed.value });
      toast(savedMessage);
      onSaved();
    } catch (err) {
      setSaveError(errorMessage(err, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setText(jsonText(initialShowWhen));
    setSaveError(null);
  }

  const effectiveMode = canUseBuilder ? mode : "raw";

  return (
    <div className="flex flex-col gap-1" data-testid={`show-when-${testId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{fieldLabel}</span>
        {dirty && <Badge tone="info">Unsaved</Badge>}
        <div className="ml-auto flex gap-1">
          <Button
            type="button"
            variant={effectiveMode === "builder" ? "secondary" : "ghost"}
            size="sm"
            disabled={!canUseBuilder}
            onClick={() => setMode("builder")}
          >
            Builder
          </Button>
          <Button
            type="button"
            variant={effectiveMode === "raw" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("raw")}
          >
            Raw JSON
          </Button>
        </div>
      </div>

      {!canUseBuilder && parsed.ok && builderResult && !builderResult.ok && (
        <p className="text-xs text-muted">{builderResult.reason}</p>
      )}

      {effectiveMode === "builder" && builderResult?.ok ? (
        <div className="flex flex-col gap-2">
          {builderResult.value.rows.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-foreground">
              Match
              <select
                className="rounded border border-border bg-surface px-2 py-1 text-xs"
                value={builderResult.value.combinator}
                onChange={(e) =>
                  handleGroupChange({ ...builderResult.value, combinator: e.target.value as "all" | "any" })
                }
              >
                <option value="all">all of</option>
                <option value="any">any of</option>
              </select>
              these rows
            </label>
          )}
          {builderResult.value.rows.map((row, i) => (
            <ConditionRow
              key={i}
              row={row}
              candidates={candidates}
              onChange={(next) => updateRow(i, builderResult.value, next)}
              onRemove={() => removeRow(i, builderResult.value)}
            />
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => addRow(builderResult.value)}
          >
            Add rule row
          </Button>
        </div>
      ) : (
        <Textarea
          value={text}
          placeholder={PLACEHOLDER}
          className="min-h-16 font-mono text-xs"
          disabled={saving}
          onChange={(e) => setText(e.target.value)}
        />
      )}

      {/* Rendered regardless of which view is active (builder OR raw JSON) -- a
       * plain-English readout of the rule is more useful in raw mode, where the
       * JSON itself is harder to scan, not less. */}
      {builderResult?.ok && builderResult.value.rows.length > 0 && (
        <p className="text-xs text-muted">Shown when {describeGroup(builderResult.value, bank)}</p>
      )}

      {!parsed.ok && <p className="text-xs text-danger">{parsed.error}</p>}
      {!canUseBuilder && parsed.ok && structural && !structural.success && (
        <p className="text-xs text-danger">Not a recognized condition shape</p>
      )}
      {builderProblems.map((problem, i) => (
        <p key={i} className="text-xs text-danger">
          {problem}
        </p>
      ))}
      {referenceProblems.map((problem, i) => (
        <p key={i} className="text-xs text-danger">
          {problem}
        </p>
      ))}

      {dirty && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border px-2 py-1">
          <Button type="button" size="sm" disabled={!canSave} className="ml-auto" onClick={handleSave}>
            {saving ? "Saving..." : saveLabel}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      )}
      {saveError && <p className="text-xs text-danger">{saveError}</p>}
    </div>
  );
}

export { EMPTY_GROUP };
