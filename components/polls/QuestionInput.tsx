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
 * unanswered, and a "Prefer not to answer" control is always visible as an explicit,
 * equivalent way to skip. `value: null` and "never touched" are the same state --
 * lib/pollResponses.ts only ever writes a PollAnswer row for a question with a real
 * 1-5 `value` here, so a skip is represented purely by that row's absence, never a
 * stored null or sentinel.
 */
export default function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: PollQuestionDTO;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  function toggle(n: number) {
    onChange(value === n ? null : n);
  }

  if (question.type === "STARS") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{question.text}</p>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} — ${question.labels[n - 1]}`}
              aria-pressed={n === value}
              onClick={() => toggle(n)}
              className={cn(
                "text-2xl leading-none transition",
                value !== null && n <= value ? "text-accent" : "text-border hover:text-accent/50"
              )}
            >
              ★
            </button>
          ))}
          <span className="ml-2 text-xs text-muted">
            {value !== null ? question.labels[value - 1] : "Not answered"}
          </span>
        </div>
        <SkipChip skipped={value === null} onSkip={() => onChange(null)} />
      </div>
    );
  }

  if (question.type === "DROPDOWN") {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{question.text}</span>
        <Select
          value={value === null ? SKIP_VALUE : value}
          onChange={(e) => onChange(e.target.value === SKIP_VALUE ? null : Number(e.target.value))}
          className="max-w-xs"
        >
          <option value={SKIP_VALUE}>Prefer not to answer</option>
          {question.labels.map((label, i) => (
            <option key={i} value={i + 1}>
              {label}
            </option>
          ))}
        </Select>
      </label>
    );
  }

  // RADIO
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{question.text}</legend>
      <div className="flex flex-wrap gap-2">
        {question.labels.map((label, i) => {
          const n = i + 1;
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(n)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition",
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
      <SkipChip skipped={value === null} onSkip={() => onChange(null)} />
    </fieldset>
  );
}

function SkipChip({ skipped, onSkip }: { skipped: boolean; onSkip: () => void }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      aria-pressed={skipped}
      className={cn(
        "self-start rounded-full border px-2.5 py-1 text-[11px] transition",
        skipped
          ? "border-accent bg-accent/10 text-accent-hover dark:text-accent"
          : "border-border text-muted hover:bg-surface-muted"
      )}
    >
      Prefer not to answer
    </button>
  );
}
