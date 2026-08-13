"use client";

import { useEffect, useState } from "react";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import Button from "@/components/ui/Button";
import { POLL_ELABORATION_CONSENT_LABEL } from "@/lib/pollShared";
import { remainingPrompts, type ElaborationPrompt } from "@/lib/pollElaborationPromptsConfig";

type View = "chooser" | "open" | "added";

/**
 * The optional, end-of-poll elaboration block -- one open-ended prompt answered at a
 * time, chosen from tappable rows (NOT a native `<select>`, which costs too many taps on
 * mobile). Fully self-contained by design (poll restructure build spec): it owns its own
 * fetch of already-answered prompt keys, its own submit, and its own fixed consent line
 * (`POLL_ELABORATION_CONSENT_LABEL` -- pressing "Add this" under that label IS the
 * consent, same pattern as ReferenceOptInBlock's email field). It never reads or writes
 * anything on the parent form's state, and answering or skipping it never touches
 * PollResponse (no status, no flags, no readiness math) -- see
 * lib/pollElaborations.ts's createElaborationAnswer. That self-containment is deliberate:
 * this component can move from end-of-form to the thank-you screen later as a plain JSX
 * relocation, with zero rewrite, since all it ever needs is a `responseId`.
 *
 * `responseId` starts null until the parent's poll-open call resolves -- the chooser
 * still renders (there's nothing wrong with picking a prompt before that lands), but
 * pressing "Add this" before a responseId exists surfaces a visible message rather than
 * silently doing nothing, matching this form's "no branch may fail silently" rule.
 */
export default function ElaborationBlock({
  responseId,
  prompts,
}: {
  responseId: string | null;
  prompts: ElaborationPrompt[];
}) {
  const [answeredKeys, setAnsweredKeys] = useState<string[]>([]);
  const [view, setView] = useState<View>("chooser");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loads which prompts this response (a fresh one, or a resumed anonymous draft) has
  // already answered -- so a reload never re-offers an already-answered prompt. Waits
  // for responseId rather than firing on mount, since there's nothing to fetch before
  // poll-open resolves.
  useEffect(() => {
    if (!responseId) return;
    let cancelled = false;
    fetch(`/api/polls/responses/${responseId}/elaborations`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { answeredPromptKeys?: string[] } | null) => {
        if (cancelled || !body?.answeredPromptKeys) return;
        setAnsweredKeys(body.answeredPromptKeys);
      })
      .catch(() => {
        // Best-effort -- worst case a respondent is offered an already-answered prompt
        // again; the server's unique constraint reports that back as "skipped" rather
        // than creating a duplicate, so this never corrupts data, only wastes a tap.
      });
    return () => {
      cancelled = true;
    };
  }, [responseId]);

  const remaining = remainingPrompts(prompts, answeredKeys);
  const selectedPrompt = prompts.find((p) => p.key === selectedKey) ?? null;

  function handleChoose(key: string) {
    setSelectedKey(key);
    setText("");
    setError(null);
    setView("open");
  }

  function handleCancel() {
    setSelectedKey(null);
    setText("");
    setError(null);
    setView("chooser");
  }

  /** `submitting` is set before any validation, same "a tap is always visibly
   * registered" discipline as RateForm's handleSubmit -- and a failure leaves the typed
   * text in place rather than clearing it, so nothing written is ever lost to an error. */
  async function handleAdd() {
    if (submitting || !selectedKey || !text.trim()) return;
    if (!responseId) {
      setError("This form hasn't finished loading yet — wait a moment and try again.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/polls/responses/${responseId}/elaborations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptKey: selectedKey, text: text.trim(), consent: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't save your answer — try again.");
        setSubmitting(false);
        return;
      }
      const addedKey = selectedKey;
      setAnsweredKeys((prev) => [...prev, addedKey]);
      setSelectedKey(null);
      setText("");
      setSubmitting(false);
      setView("added");
    } catch {
      setError("Couldn't save your answer — check your connection and try again.");
      setSubmitting(false);
    }
  }

  function handleAnswerAnother() {
    setError(null);
    setView("chooser");
  }

  if (prompts.length === 0) return null;

  return (
    <div data-poll-elaboration className="flex flex-col gap-3 rounded border border-border p-4">
      <p className="text-sm font-semibold text-foreground">One more thing (optional)</p>
      {error && (
        <p role="alert" className="rounded border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {view === "chooser" &&
        (remaining.length > 0 ? (
          <div className="flex flex-col gap-2">
            {remaining.map((prompt) => (
              <button
                key={prompt.key}
                type="button"
                data-poll-elaboration-prompt
                onClick={() => handleChoose(prompt.key)}
                className="min-h-11 w-full rounded border border-border px-3 py-2 text-left text-sm text-foreground transition-colors duration-[120ms] ease-out hover:border-accent-hover"
              >
                {prompt.text}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Thanks — you&rsquo;ve answered every extra question.</p>
        ))}

      {view === "open" && selectedPrompt && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{selectedPrompt.text}</p>
          <AutoGrowTextarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            minRows={4}
            maxLength={2000}
            className="text-sm"
            autoFocus
          />
          <p className="text-xs text-muted">{POLL_ELABORATION_CONSENT_LABEL}</p>
          <div className="flex gap-2">
            <Button type="button" onClick={handleAdd} disabled={submitting || !text.trim()} className="min-h-11">
              {submitting ? "Adding…" : "Add this"}
            </Button>
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={submitting} className="min-h-11">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {view === "added" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-foreground">Added — a moderator will review it before it appears.</p>
          {remaining.length > 0 && (
            <button
              type="button"
              onClick={handleAnswerAnother}
              className="w-fit text-sm font-medium text-primary hover:underline"
            >
              Answer another
            </button>
          )}
        </div>
      )}
    </div>
  );
}
