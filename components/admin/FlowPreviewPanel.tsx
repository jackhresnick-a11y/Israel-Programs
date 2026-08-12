"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveFlow, withAnswer, answerStateToRecord, type FlowAnswerState, type FlowQuestionDTO } from "@/lib/flowShared";
import type { FlowVideoDTO, FlowVideoTriggerDTO } from "@/lib/flowClips";
import FlowStep from "@/components/find/FlowStep";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

type PreviewResult = {
  survivorCount: number;
  totalCount: number;
  bandCounts: { strong: number; partial: number; weak: number; unranked: number };
};

async function fetchPreview(state: FlowAnswerState): Promise<PreviewResult> {
  const res = await fetch("/api/admin/flow/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers: answerStateToRecord(state) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to compute preview");
  }
  return res.json();
}

/**
 * The "flow half" of Step 7's admin preview screen: walks the REAL FlowStep against a
 * locally-held answer map -- resolveFlow/withAnswer are pure, so every branch
 * (showWhen, Q6's option sets, skip, back) recomputes here with zero server round trip
 * and zero risk of drifting from what a real respondent at /match would see. The "s"
 * FlowStep normally uses to key clip rollout is a fixed, obviously-fake string here on
 * purpose -- nothing this panel does is ever recorded as a FlowSession/FlowResponse.
 *
 * The "ranking half" sits in the card above the step: every answer-state change
 * refetches POST /api/admin/flow/preview (the same runMatchResults pipeline
 * /match/results uses) so survivor/band counts always describe the CURRENT walk, never
 * a stale one -- same "don't read a number for a different selection" discipline as
 * BucketRuleManager's previewKey gate, just continuous here instead of gating a save
 * (nothing here writes anything, so there's nothing to gate).
 */
export default function FlowPreviewPanel({
  questions,
  triggers,
  videosById,
}: {
  questions: FlowQuestionDTO[];
  triggers: FlowVideoTriggerDTO[];
  videosById: Record<string, FlowVideoDTO>;
}) {
  const [state, setState] = useState<FlowAnswerState>(new Map());
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const resolved = useMemo(() => resolveFlow(questions, state, requestedKey), [questions, state, requestedKey]);

  // Keys the refetch on the resolved (pruned) state's actual contents, not object
  // identity -- resolveFlow returns a new Map on every call, so keying on the Map
  // itself would refetch on every render even when nothing meaningful changed.
  const stateKey = useMemo(
    () => JSON.stringify([...resolved.state.entries()].sort(([a], [b]) => a.localeCompare(b))),
    [resolved.state]
  );

  useEffect(() => {
    let cancelled = false;
    // Synchronously flipping to a loading state as the selection changes (rather than
    // only after the request resolves) is deliberate here, same precedent as
    // BucketRuleManager.tsx's rule preview.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewLoading(true);
    setPreviewError(null);
    fetchPreview(resolved.state)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : "Failed to compute preview");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // resolved.state is fully summarized by stateKey; re-running on the key alone
    // avoids a redundant fetch when resolveFlow produces an equal-but-new Map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  function handlePreviewAction(action: { type: "back" } | { type: "skip" } | { type: "advance"; answer: string | null }) {
    if (action.type === "back") {
      setRequestedKey(resolved.prevKey);
      return;
    }
    if (!resolved.current) return;
    if (action.type === "skip") {
      setState(withAnswer(resolved.state, resolved.current.key, null));
      setRequestedKey(null);
      return;
    }
    // A real (non-interstitial) question's radios carry `required` in production,
    // blocking Continue until something is selected -- FlowStep's onPreviewAction
    // bypass skips that native check (see FlowStep.tsx's comment on the button's
    // onClick), so replicate the same guard here instead of silently treating an
    // empty Continue click as a skip.
    const isInterstitial = resolved.visibleOptions.length === 0;
    if (!isInterstitial && action.answer === null) return;
    setState(withAnswer(resolved.state, resolved.current.key, action.answer ? [action.answer] : []));
    setRequestedKey(null);
  }

  function handleRestart() {
    setState(new Map());
    setRequestedKey(null);
  }

  const currentTriggers = resolved.current ? triggers.filter((t) => t.questionId === resolved.current!.id) : [];
  const stepNumber = resolved.current ? resolved.visible.findIndex((q) => q.key === resolved.current!.key) + 1 : 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">Live results preview</h2>
        {previewLoading && <span className="text-xs text-muted">Computing...</span>}
        {previewError && <span className="text-xs text-danger">{previewError}</span>}
        {preview && !previewLoading && !previewError && (
          <>
            <Badge tone="neutral">
              {preview.survivorCount} / {preview.totalCount} survive the hard eliminators
            </Badge>
            <Badge tone="tag">strong {preview.bandCounts.strong}</Badge>
            <Badge tone="tag">partial {preview.bandCounts.partial}</Badge>
            <Badge tone="tag">weak {preview.bandCounts.weak}</Badge>
            {preview.bandCounts.unranked > 0 && <Badge tone="info">unranked {preview.bandCounts.unranked}</Badge>}
          </>
        )}
        <Button type="button" variant="secondary" size="sm" className="ml-auto" onClick={handleRestart}>
          Restart preview
        </Button>
      </Card>

      {resolved.current ? (
        <FlowStep
          // Forces a fresh instance (and fresh internal selectedKey) whenever the
          // resolved question changes -- FlowStep isn't unmounted between steps here
          // the way it is on /match (a full server round trip), so without this key
          // React would keep the previous question's selection state alive.
          key={resolved.current.key}
          sessionId="admin-preview"
          question={resolved.current}
          options={resolved.visibleOptions}
          state={resolved.state}
          prevKey={resolved.prevKey}
          stepNumber={stepNumber}
          totalSteps={resolved.visible.length}
          triggers={currentTriggers}
          videosById={videosById}
          conditionAnswers={resolved.conditionAnswers}
          onPreviewAction={handlePreviewAction}
        />
      ) : (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm text-foreground">
            Every visible question has been answered or skipped -- this is where a real respondent would reach the
            review/submit screen.
          </p>
          {resolved.prevKey && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setRequestedKey(resolved.prevKey)}
            >
              Back
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
