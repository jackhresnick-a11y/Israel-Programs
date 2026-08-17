"use client";

import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import FilterDropdown from "@/components/ui/FilterDropdown";
import type { BuilderOperator, BuilderQuestionRef, BuilderRow } from "@/lib/flowRuleBuilder";

const OPERATOR_LABELS: Record<BuilderOperator, string> = {
  isOneOf: "is one of",
  isNotOneOf: "is not one of",
  answered: "is answered",
  notAnswered: "is not answered",
};

const OPERATORS: BuilderOperator[] = ["isOneOf", "isNotOneOf", "answered", "notAnswered"];

/**
 * One [question] [operator] [options] row of the visual rule builder. `candidates` is
 * pre-filtered by the caller to questions ordered strictly before the question this
 * rule belongs to (a forward/self reference can never evaluate true -- see
 * lib/flow.ts's assertConditionReferencesValid) so the dropdown can't offer an invalid
 * choice in the common case; validateConditionBuilder (run by the caller against the
 * FULL bank) still catches a rule that became invalid some other way -- e.g. seeded
 * from raw JSON, or a question reordered after this rule was built.
 */
export default function ConditionRow({
  row,
  candidates,
  disabled,
  onChange,
  onRemove,
}: {
  row: BuilderRow;
  candidates: BuilderQuestionRef[];
  disabled?: boolean;
  onChange: (row: BuilderRow) => void;
  onRemove: () => void;
}) {
  const targetQuestion = candidates.find((q) => q.key === row.questionKey);
  const needsOptions = row.operator === "isOneOf" || row.operator === "isNotOneOf";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-surface px-2 py-2">
      <Select
        value={row.questionKey}
        disabled={disabled}
        className="w-auto max-w-64"
        onChange={(e) => onChange({ ...row, questionKey: e.target.value, optionKeys: [] })}
      >
        <option value="">-- choose a question --</option>
        {row.questionKey && !targetQuestion && (
          <option value={row.questionKey}>{row.questionKey} (not a valid earlier question)</option>
        )}
        {candidates.map((q) => (
          <option key={q.key} value={q.key}>
            {q.prompt}
          </option>
        ))}
      </Select>

      <Select
        value={row.operator}
        disabled={disabled}
        className="w-auto"
        onChange={(e) => onChange({ ...row, operator: e.target.value as BuilderOperator })}
      >
        {OPERATORS.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </Select>

      {needsOptions && (
        <FilterDropdown
          label={row.optionKeys.length > 0 ? `${row.optionKeys.length} option(s)` : "choose options"}
          tint="info"
          selected={row.optionKeys}
          options={(targetQuestion?.options ?? []).map((o) => ({
            value: o.key,
            label: o.status === "RETIRED" ? `${o.label} (retired)` : o.label,
          }))}
          onToggle={(key) =>
            onChange({
              ...row,
              optionKeys: row.optionKeys.includes(key)
                ? row.optionKeys.filter((k) => k !== key)
                : [...row.optionKeys, key],
            })
          }
        />
      )}

      <Button type="button" variant="ghost" size="sm" disabled={disabled} className="ml-auto" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
