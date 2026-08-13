"use client";

import { useState } from "react";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import QuestionInput from "@/components/polls/QuestionInput";
import { POLL_FIRST_COMMENT_EXPLAINER, POLL_COMMENT_PLACEHOLDER, type PollQuestionDTO } from "@/lib/pollShared";

/**
 * One question's rating control plus its optional, collapsed-by-default review comment --
 * shared by the signed-in and anonymous forms so review UX never drifts between them.
 * Consent for written comments is collected once, at the bottom of the form -- see the
 * single consent checkbox rendered above the questions -- not per question. The
 * moderation notice itself is likewise stated once, in ReviewConsentContext above the
 * whole question list, not repeated as placeholder text under every question.
 *
 * `isFirst` (poll restructure item 4) governs the collapsed trigger's verbosity AND
 * starting state, not the moderation notice (already handled once, above): the poll's
 * very first comment box opens expanded with POLL_FIRST_COMMENT_EXPLAINER above the
 * field -- explaining *why a longer answer is worth writing*, at the one point a
 * respondent is actually looking at an open textarea -- while every later box stays
 * collapsed behind the bare "Add a comment" trigger and, once opened, carries only
 * POLL_COMMENT_PLACEHOLDER. Repeating the full explainer on every question was the
 * single biggest source of wasted scroll on the old page.
 *
 * Single flow container per question (style guide §8.3/§4): 32px bottom margin, nothing
 * absolutely positioned inside it.
 */
export default function QuestionWithReview({
  question,
  value,
  onValueChange,
  na,
  onNaChange,
  reviewText,
  onReviewTextChange,
  isFirst = false,
}: {
  question: PollQuestionDTO;
  value: number | null;
  onValueChange: (value: number | null) => void;
  na: boolean;
  onNaChange: (na: boolean) => void;
  reviewText: string;
  onReviewTextChange: (text: string) => void;
  isFirst?: boolean;
}) {
  // Initialized once from whatever reviewText this question already carries at mount, OR
  // true for the first question -- the first comment box opens expanded by design (see
  // the doc comment above); every other box starts collapsed (style guide §8's "collapse
  // the optional comment box") unless it already has text.
  const [commentOpen, setCommentOpen] = useState(() => isFirst || reviewText.trim().length > 0);

  return (
    <div className="mb-8 flex flex-col gap-2 last:mb-0">
      <QuestionInput question={question} value={value} onChange={onValueChange} na={na} onNaChange={onNaChange} />
      <div className="pl-1">
        {commentOpen ? (
          <div className="flex flex-col gap-1">
            {isFirst && <p className="text-xs text-muted">{POLL_FIRST_COMMENT_EXPLAINER}</p>}
            <AutoGrowTextarea
              placeholder={POLL_COMMENT_PLACEHOLDER}
              value={reviewText}
              onChange={(e) => onReviewTextChange(e.target.value)}
              minRows={4}
              maxLength={1000}
              className="text-sm"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCommentOpen(true)}
            className="w-fit text-sm font-medium text-primary hover:underline"
          >
            Add a comment
          </button>
        )}
      </div>
    </div>
  );
}
