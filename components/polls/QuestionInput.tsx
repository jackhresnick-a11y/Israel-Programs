"use client";

import Select from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import type { PollQuestionDTO } from "@/lib/pollShared";

export default function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: PollQuestionDTO;
  value: number;
  onChange: (value: number) => void;
}) {
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
              onClick={() => onChange(n)}
              className={cn("text-2xl leading-none transition", n <= value ? "text-accent" : "text-border hover:text-accent/50")}
            >
              ★
            </button>
          ))}
          <span className="ml-2 text-xs text-muted">{question.labels[value - 1]}</span>
        </div>
      </div>
    );
  }

  if (question.type === "DROPDOWN") {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{question.text}</span>
        <Select value={value} onChange={(e) => onChange(Number(e.target.value))} className="max-w-xs">
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
              onClick={() => onChange(n)}
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
    </fieldset>
  );
}
