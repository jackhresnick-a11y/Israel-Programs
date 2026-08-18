"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import ConditionRow from "./ConditionRow";
import {
  optionSetRulesToBuilder,
  builderToOptionSetRules,
  validateOptionSetRulesBuilder,
  validateRawOptionSetRules,
  describeSetRules,
  collectOptionSetKeys,
  jsonText,
  parseJsonText,
  type BuilderQuestionRef,
  type BuilderRow,
  type BuilderSetRules,
} from "@/lib/flowRuleBuilder";
import { flowOptionSetRulesSchema } from "@/lib/flowShared";

const NEW_SET_SENTINEL = "__new__";

function OptionSetKeySelect({
  value,
  knownKeys,
  onChange,
}: {
  value: string;
  knownKeys: string[];
  onChange: (key: string) => void;
}) {
  const [typingNew, setTypingNew] = useState(!!value && !knownKeys.includes(value));
  if (typingNew) {
    return (
      <Input
        value={value}
        placeholder="New option-set key"
        className="w-auto max-w-40"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Select
      value={value}
      className="w-auto"
      onChange={(e) => {
        if (e.target.value === NEW_SET_SENTINEL) {
          setTypingNew(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
    >
      <option value="">-- option set --</option>
      {knownKeys.map((key) => (
        <option key={key} value={key}>
          {key}
        </option>
      ))}
      <option value={NEW_SET_SENTINEL}>+ New option-set key...</option>
    </Select>
  );
}

/**
 * The option-set rules editor -- same builder/raw split and same "raw text is the
 * single source of truth" contract as RuleEditor, for the optionSetRules column
 * (which option set, e.g. Q6's boys/girls/mixed, a question shows for a given
 * earlier answer). Each rule pairs one ConditionRow with a "→ [option set]" target;
 * option-set keys are sourced from collectOptionSetKeys (every key already declared
 * on this question's options, its defaultOptionSetKey, or an existing rule) rather
 * than free text, with an explicit escape hatch for a genuinely new key.
 */
export default function OptionSetRulesEditor({
  question,
  bank,
  onSaved,
  api,
  errorMessage,
}: {
  question: {
    id: string;
    key: string;
    order: number;
    optionSetRules: unknown;
    defaultOptionSetKey: string | null;
    options: { optionSetKeys: string[] }[];
  };
  bank: BuilderQuestionRef[];
  onSaved: () => void;
  api: (url: string, method: string, body?: object) => Promise<unknown>;
  errorMessage: (err: unknown, fallback: string) => string;
}) {
  const { toast } = useToast();
  const [text, setText] = useState(jsonText(question.optionSetRules));
  const [mode, setMode] = useState<"builder" | "raw">("builder");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const parsed = parseJsonText(text);
  const dirty = !parsed.ok || JSON.stringify(parsed.value) !== JSON.stringify(question.optionSetRules ?? null);

  const candidates = bank.filter((q) => q.order < question.order && q.key !== question.key);
  const self = { key: question.key, order: question.order };
  const knownKeys = collectOptionSetKeys(question);

  const builderResult = parsed.ok ? optionSetRulesToBuilder(parsed.value) : null;
  const canUseBuilder = builderResult?.ok ?? false;
  const structural = parsed.ok && parsed.value != null ? flowOptionSetRulesSchema.safeParse(parsed.value) : null;

  // Same builder-vs-raw validation split as RuleEditor: in builder mode,
  // validateOptionSetRulesBuilder's per-row/per-rule messages (including "Default
  // option set is required...") run against the in-progress BuilderSetRules, which
  // stays representable even mid-edit (an empty default/questionKey fails the strict
  // schema but isn't a shape problem). Otherwise validateRawOptionSetRules walks the
  // full parsed tree for raw-only edits.
  const builderProblems =
    builderResult && builderResult.ok ? validateOptionSetRulesBuilder(builderResult.value, self, bank) : [];
  const referenceProblems =
    !canUseBuilder && parsed.ok && structural?.success ? validateRawOptionSetRules(structural.data, self, bank) : [];

  const structurallyValid = !parsed.ok || parsed.value == null || (structural?.success ?? false);
  const canSave =
    parsed.ok &&
    dirty &&
    !saving &&
    structurallyValid &&
    referenceProblems.length === 0 &&
    builderProblems.length === 0;

  function handleRulesChange(next: BuilderSetRules) {
    setText(jsonText(builderToOptionSetRules(next)));
  }

  function updateRuleRow(index: number, current: BuilderSetRules, nextRow: BuilderRow) {
    const rules = [...current.rules];
    rules[index] = { ...rules[index], row: nextRow };
    handleRulesChange({ ...current, rules });
  }

  function updateRuleSetKey(index: number, current: BuilderSetRules, optionSetKey: string) {
    const rules = [...current.rules];
    rules[index] = { ...rules[index], optionSetKey };
    handleRulesChange({ ...current, rules });
  }

  function removeRule(index: number, current: BuilderSetRules) {
    handleRulesChange({ ...current, rules: current.rules.filter((_, i) => i !== index) });
  }

  function addRule(current: BuilderSetRules) {
    handleRulesChange({
      ...current,
      rules: [...current.rules, { optionSetKey: "", row: { questionKey: "", operator: "answered", optionKeys: [] } }],
    });
  }

  async function handleSave() {
    if (!parsed.ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api(`/api/admin/flow/questions/${question.id}`, "PATCH", { optionSetRules: parsed.value });
      toast("Option-set rules saved");
      onSaved();
    } catch (err) {
      setSaveError(errorMessage(err, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setText(jsonText(question.optionSetRules));
    setSaveError(null);
  }

  const effectiveMode = canUseBuilder ? mode : "raw";

  return (
    <div className="flex flex-col gap-1" data-testid={`option-set-rules-${question.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Option-set rules (empty = one shared option set for every respondent)</span>
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
          {builderResult.value.rules.map((rule, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <ConditionRow
                row={rule.row}
                candidates={candidates}
                onChange={(next) => updateRuleRow(i, builderResult.value, next)}
                onRemove={() => removeRule(i, builderResult.value)}
              />
              <span className="text-xs text-muted">→ option set:</span>
              <OptionSetKeySelect
                value={rule.optionSetKey}
                knownKeys={knownKeys}
                onChange={(key) => updateRuleSetKey(i, builderResult.value, key)}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => addRule(builderResult.value)}
          >
            Add rule
          </Button>
          <label className="flex items-center gap-2 text-xs text-foreground">
            Default option set (used when no rule above matches)
            <OptionSetKeySelect
              value={builderResult.value.default}
              knownKeys={knownKeys}
              onChange={(key) => handleRulesChange({ ...builderResult.value, default: key })}
            />
          </label>
        </div>
      ) : (
        <Textarea
          value={text}
          placeholder='{"v":1,"default":"mixed","rules":[{"optionSetKey":"boys","when":{...}}]}'
          className="min-h-16 font-mono text-xs"
          disabled={saving}
          onChange={(e) => setText(e.target.value)}
        />
      )}

      {/* Rendered regardless of which view is active -- see RuleEditor's identical
       * comment. */}
      {builderResult?.ok &&
        describeSetRules(builderResult.value, bank).map((line, i) => (
          <p key={i} className="text-xs text-muted">
            {line}
          </p>
        ))}

      {!parsed.ok && <p className="text-xs text-danger">{parsed.error}</p>}
      {!canUseBuilder && parsed.ok && structural && !structural.success && (
        <p className="text-xs text-danger">Not a recognized option-set rules shape</p>
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
            {saving ? "Saving..." : "Save option-set rules"}
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
