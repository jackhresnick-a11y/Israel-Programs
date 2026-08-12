"use client";

import Link from "next/link";
import { useState } from "react";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import { buttonVariants } from "@/components/ui/Button";
import {
  buildMatchHref,
  serializeAnswerState,
  type FlowAnswerState,
  type FlowAnswers,
  type FlowOptionDTO,
  type FlowQuestionDTO,
} from "@/lib/flowShared";
import { selectClip, type FlowVideoTriggerDTO, type FlowVideoDTO } from "@/lib/flowClips";
import FlowClip from "@/components/find/FlowClip";

/**
 * One step of the /match challenge flow. Unlike v1's FindStep (where every option is
 * its own navigation link), each option here is a radio in a real `<form>` --
 * find-v2-question-spec.md requires a deliberate select-then-Continue interaction (a
 * clip can fire on selection and the respondent may revise before moving on), which a
 * plain link-per-option can't express.
 *
 * "use client" ONLY for the clip-mounting layer -- the form/radios/Continue/Skip/Back
 * mechanics underneath are unchanged from the server-component version and remain
 * fully JS-off-functional: native `required` on the radio group blocks an empty
 * Continue, the Skip button carries `formNoValidate` to bypass that same constraint,
 * and selectClip/FlowClip only ever ADD a clip on top of a form that already works
 * without them. Without JavaScript, the clip slot simply never renders -- the flow
 * still completes end to end, same guarantee v1 makes.
 *
 * Continue carries `name="advance" value="1"` even though a real (non-interstitial)
 * answer already has `answer=<key>` as its own signal -- an interstitial question has
 * NO radios, so without this the Continue click would produce a query string
 * (`?q=...&a=...`) indistinguishable from a plain reload of the same URL, and
 * app/match/page.tsx would never know a submission happened at all.
 *
 * `onPreviewAction` (optional) is the ONLY hook the admin preview screen needs to
 * reuse this exact component instead of a hand-duplicated copy (find-v2-question-spec.md's
 * build order calls for the REAL FlowStep, so drift between preview and production is
 * impossible by construction). When absent -- true for every /match render -- the form
 * still submits/navigates exactly as before, byte-for-byte; when present,
 * FlowPreviewPanel.tsx supplies it to intercept Back/Skip/Continue and recompute
 * locally instead of leaving the admin page.
 */
export default function FlowStep({
  sessionId,
  question,
  options,
  state,
  prevKey,
  stepNumber,
  totalSteps,
  triggers,
  videosById,
  conditionAnswers,
  onPreviewAction,
}: {
  sessionId: string;
  question: FlowQuestionDTO;
  options: FlowOptionDTO[];
  state: FlowAnswerState;
  prevKey: string | null;
  stepNumber: number;
  totalSteps: number;
  /** This question's own ACTIVE triggers only -- lib/flowRun.ts pre-filters by
   * questionId so this component never needs to know about any other question. */
  triggers: FlowVideoTriggerDTO[];
  videosById: Record<string, FlowVideoDTO>;
  /** Answers to questions BEFORE this one -- what a trigger's own `when` (e.g. Q6's
   * gender-split clips) evaluates against. Never includes this question's own
   * answer, since a condition can never reference its own question. */
  conditionAnswers: FlowAnswers;
  onPreviewAction?: (action: { type: "back" } | { type: "skip" } | { type: "advance"; answer: string | null }) => void;
}) {
  const existing = state.get(question.key);
  const initialKey = existing && existing.length > 0 ? existing[0] : null;
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const isInterstitial = options.length === 0;

  const activeVideoId = selectClip(triggers, selectedKey ? [selectedKey] : null, conditionAnswers, sessionId);
  const activeVideo = activeVideoId ? videosById[activeVideoId] : null;
  // Did THIS video come from an answer-triggered clip, or a display-triggered one?
  // Only matters for the facade/autoplay choice below -- selectClip already decided
  // which video wins; this just reads back which mode it came from.
  const firedFromAnswer =
    selectedKey !== null &&
    triggers.some(
      (t) => t.mode === "ON_ANSWER" && t.status === "ACTIVE" && t.videoId === activeVideoId && t.optionKeys.includes(selectedKey)
    );

  return (
    <PageContainer width="narrow">
      <PageHeader title="Find your program" description="A few honest questions -- skip any of them." />
      <div className="flex flex-col gap-6">
        <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted">
          Question {stepNumber} of {totalSteps}
        </p>
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-foreground">{question.prompt}</h3>
          {question.helpText && <p className="text-sm text-muted">{question.helpText}</p>}
        </div>

        {activeVideo && <FlowClip video={activeVideo} autoplay={firedFromAnswer} />}

        <form method="GET" action="/match" className="flex flex-col gap-4">
          <input type="hidden" name="s" value={sessionId} />
          <input type="hidden" name="a" value={serializeAnswerState(state)} />
          <input type="hidden" name="q" value={question.key} />

          {!isInterstitial && (
            <div className="flex flex-col divide-y divide-border rounded border border-border">
              {options.map((option) => (
                <label
                  key={option.key}
                  className="flex cursor-pointer flex-col gap-1 px-4 py-3 text-sm text-foreground transition-colors duration-[120ms] ease-out hover:bg-accent/10"
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="answer"
                      value={option.key}
                      required
                      defaultChecked={option.key === selectedKey}
                      onChange={() => setSelectedKey(option.key)}
                      className="h-4 w-4 accent-accent-strong"
                    />
                    {option.label}
                  </span>
                  {option.rationale && <span className="pl-7 text-xs text-muted">{option.rationale}</span>}
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {prevKey &&
              (onPreviewAction ? (
                <button
                  type="button"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                  onClick={() => onPreviewAction({ type: "back" })}
                >
                  Back
                </button>
              ) : (
                <Link
                  href={buildMatchHref("/match", prevKey, state, sessionId)}
                  prefetch={false}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Back
                </Link>
              ))}
            {question.skippable && (
              <button
                type="submit"
                name="skip"
                value="1"
                formNoValidate
                className={buttonVariants({ variant: "ghost", size: "sm" })}
                onClick={(e) => {
                  if (!onPreviewAction) return;
                  e.preventDefault();
                  onPreviewAction({ type: "skip" });
                }}
              >
                Skip this question
              </button>
            )}
            <button
              type="submit"
              name="advance"
              value="1"
              className={buttonVariants({ variant: "primary", size: "sm", className: "ml-auto" })}
              onClick={(e) => {
                if (!onPreviewAction) return;
                e.preventDefault();
                onPreviewAction({ type: "advance", answer: selectedKey });
              }}
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </PageContainer>
  );
}
