"use client";

import Select from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import type { PollQuestionDTO } from "@/lib/pollShared";

const SKIP_VALUE = "";

/**
 * Every question type starts unanswered and stays that way until the respondent
 * actually taps something -- there is no pre-selected value, so an untouched question
 * is never indistinguishable from an answered one (a real data-quality bug the
 * original pre-filled-at-3 design had: a respondent who never touched a question
 * silently recorded a real 3). Tapping an already-selected value clears it back to
 * unanswered. `value: null` and "never touched" are the same state -- lib/pollResponses.ts
 * only ever writes a PollAnswer row for a question with a real 1-5 `value` here, so a
 * skip is represented purely by that row's absence, never a stored null or sentinel.
 *
 * The N/A checkbox is a *separate*, explicit signal from "untouched" -- checking it
 * clears any selected value and disables the inputs until unchecked, and its state is
 * tracked independently (`na`/`onNaChange`) rather than folded into `value === null`,
 * so moderation can tell "never touched this" apart from "deliberately opted out."
 * Both still resolve to no PollAnswer row -- see RateForm.tsx's buildSubmission, which
 * routes `na` into a separate `naQuestionIds` array in the submission payload.
 */
export default function QuestionInput({
  question,
  value,
  onChange,
  na,
  onNaChange,
}: {
  question: PollQuestionDTO;
  value: number | null;
  onChange: (value: number | null) => void;
  na: boolean;
  onNaChange: (na: boolean) => void;
}) {
  function toggle(n: number) {
    if (na) return;
    onChange(value === n ? null : n);
  }

  function toggleNa() {
    const next = !na;
    onNaChange(next);
    if (next) onChange(null);
  }

  if (question.type === "STARS") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{question.text}</p>
        <div className={cn("flex items-center gap-1", na && "opacity-40")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={na}
              aria-label={`${n} — ${question.labels[n - 1]}`}
              aria-pressed={n === value}
              onClick={() => toggle(n)}
              className={cn(
                "text-2xl leading-none transition",
                na && "cursor-not-allowed",
                value !== null && n <= value ? "text-accent" : "text-border hover:text-accent/50"
              )}
            >
              ★
            </button>
          ))}
          <span className="ml-2 text-xs text-muted">
            {na ? "N/A" : value !== null ? question.labels[value - 1] : "Not answered"}
          </span>
        </div>
        <NaCheckbox na={na} onToggle={toggleNa} />
      </div>
    );
  }

  if (question.type === "DROPDOWN") {
    return (
      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">{question.text}</span>
          <Select
            value={value === null ? SKIP_VALUE : value}
            disabled={na}
            onChange={(e) => onChange(e.target.value === SKIP_VALUE ? null : Number(e.target.value))}
            className={cn("max-w-xs", na && "opacity-40")}
          >
            <option value={SKIP_VALUE}>Select…</option>
            {question.labels.map((label, i) => (
              <option key={i} value={i + 1}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <NaCheckbox na={na} onToggle={toggleNa} />
      </div>
    );
  }

  // RADIO
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{question.text}</legend>
      <div className={cn("flex flex-wrap gap-2", na && "opacity-40")}>
        {question.labels.map((label, i) => {
          const n = i + 1;
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              disabled={na}
              aria-pressed={selected}
              onClick={() => toggle(n)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition",
                na && "cursor-not-allowed",
                selected
                  ? "border-accent bg-accent/15 text-accent-hover dark:text-accent"
                  : "border-border text-muted hover:bg-surface-muted"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <NaCheckbox na={na} onToggle={toggleNa} />
    </fieldset>
  );
}

function NaCheckbox({ na, onToggle }: { na: boolean; onToggle: () => void }) {
  return (
    <label className="flex w-fit items-center gap-1.5 text-[11px] text-muted">
      <input type="checkbox" checked={na} onChange={onToggle} className="accent-accent" />
      N/A
    </label>
  );
}
