"use client";

import Select from "@/components/ui/Select";
import SegmentedScale from "@/components/polls/SegmentedScale";
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
 * routes `na` into a separate `naQuestionIds` array in the submission payload. That
 * signal is now surfaced as a trailing "Skip" segment on the scale itself
 * (SegmentedScale) rather than a separate checkbox row below it -- the `na`/`onNaChange`
 * contract is unchanged either way.
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
  if (question.type === "STARS") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{question.text}</p>
        <SegmentedScale
          variant="numeric"
          labels={question.labels}
          value={value}
          onChange={onChange}
          na={na}
          onNaChange={onNaChange}
          ariaLabelPrefix={question.text}
        />
      </div>
    );
  }

  if (question.type === "DROPDOWN") {
    return (
      <div className="flex flex-col gap-2">
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
        <SkipToggle na={na} onToggle={() => onNaChange(!na)} />
      </div>
    );
  }

  // RADIO
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-foreground">{question.text}</p>
      <SegmentedScale
        variant="labels"
        labels={question.labels}
        value={value}
        onChange={onChange}
        na={na}
        onNaChange={onNaChange}
        ariaLabelPrefix={question.text}
      />
    </div>
  );
}

/** DROPDOWN's standalone Skip control -- no live question uses DROPDOWN today, but the
 * branch still needs the same skip affordance SegmentedScale gives STARS/RADIO rather
 * than reintroducing the old checkbox. */
function SkipToggle({ na, onToggle }: { na: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={na}
      onClick={onToggle}
      className={cn(
        "w-fit rounded border px-3 py-2 text-sm font-medium transition-colors duration-[120ms] ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        na ? "border-border bg-border text-foreground" : "border-border bg-surface text-muted hover:bg-surface-muted"
      )}
    >
      Skip
    </button>
  );
}
