"use client";

import SegmentedScale from "@/components/polls/SegmentedScale";
import StackedChoice from "@/components/polls/StackedChoice";
import NaOptOut from "@/components/polls/NaOptOut";
import { resolveOptionKind } from "@/lib/pollShared";
import type { PollQuestionDTO } from "@/lib/pollShared";

/**
 * Every question starts unanswered and stays that way until the respondent actually
 * taps something -- there is no pre-selected value, so an untouched question is never
 * indistinguishable from an answered one (a real data-quality bug the original
 * pre-filled-at-3 design had: a respondent who never touched a question silently
 * recorded a real 3). Tapping an already-selected value clears it back to unanswered.
 * `value: null` and "never touched" are the same state -- lib/pollResponses.ts only ever
 * writes a PollAnswer row for a question with a real 1-5 `value` here, so a skip is
 * represented purely by that row's absence, never a stored null or sentinel.
 *
 * N/A is a *separate*, explicit signal from "untouched" -- activating it clears any
 * selected value, and its state is tracked independently (`na`/`onNaChange`) rather than
 * folded into `value === null`, so moderation can tell "never touched this" apart from
 * "deliberately opted out." Both still resolve to no PollAnswer row -- see
 * RateForm.tsx's buildSubmission, which routes `na` into a separate `naQuestionIds`
 * array in the submission payload. That signal is a small "N/A" text link rendered by
 * NaOptOut, beneath the answer control rather than inside it.
 *
 * The answer control itself is chosen by resolveOptionKind, never by question.type
 * directly: "numeric" (STARS) and "ordinal" (RADIO with an ordered spectrum) both go
 * through SegmentedScale's numerals-only control; "categorical" (RADIO with unordered
 * alternatives, e.g. unit_assignments) goes through StackedChoice's full-width rows
 * instead. Both controls share one selected-state color (ink-navy) -- the split only
 * ever changes layout, never color.
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
  const kind = resolveOptionKind(question);

  function select(v: number | null) {
    if (na) onNaChange(false);
    onChange(v);
  }

  function toggleNa() {
    const next = !na;
    onNaChange(next);
    if (next) onChange(null);
  }

  return (
    <div className="flex flex-col gap-2" data-poll-question={question.key}>
      <p className="text-sm font-medium text-foreground">{question.text}</p>
      {kind === "categorical" ? (
        <StackedChoice labels={question.labels} value={value} onChange={select} ariaLabelPrefix={question.text} />
      ) : (
        <SegmentedScale labels={question.labels} value={value} onChange={select} ariaLabelPrefix={question.text} />
      )}
      <NaOptOut na={na} onToggle={toggleNa} ariaLabelPrefix={question.text} />
    </div>
  );
}
