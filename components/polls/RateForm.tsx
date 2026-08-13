"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import QuestionWithReview from "@/components/polls/QuestionWithReview";
import ElaborationBlock from "@/components/polls/ElaborationBlock";
import ThankYouPanel from "@/components/polls/ThankYouPanel";
import Button from "@/components/ui/Button";
import { pollDraftKey, yearAttendedOptions, POLL_REFERENCE_CONSENT_LABEL, type PollQuestionDTO, type PollBucketDTO } from "@/lib/pollShared";
import type { PartnerLinkSlot } from "@/lib/partnerLinksConfig";
import type { ElaborationPrompt } from "@/lib/pollElaborationPromptsConfig";

type RateFormProps =
  | {
      mode: "signed-in";
      programId: string;
      programName: string;
      questions: PollQuestionDTO[];
      extras: { bucket: PollBucketDTO; questions: PollQuestionDTO[] }[];
      existingAnswers?: Record<string, number>;
      existingNaQuestionIds?: string[];
      /** Slot 3, resolved server-side (fail-closed to null). Rendered ONLY in the
       * post-transition confirmation state -- never before. */
      postPollCta: PartnerLinkSlot | null;
      /** The program's public poll link (lib/pollConfig.ts's getPublicPollLink),
       *  threaded down to ThankYouPanel's WhatsAppShareButton -- null falls back to the
       *  site's /rate picker rather than the respondent's own referrer token. */
      sharePollLink: string | null;
      /** The live, enabled elaboration prompts (lib/pollElaborationPrompts.ts) -- rendered
       * as the last item in the question list via ElaborationBlock. */
      elaborationPrompts: ElaborationPrompt[];
    }
  | {
      mode: "anonymous";
      programId: string;
      programSlug: string;
      programName: string;
      referrerToken: string;
      questions: PollQuestionDTO[];
      extras: { bucket: PollBucketDTO; questions: PollQuestionDTO[] }[];
      /** Slot 3, resolved server-side (fail-closed to null). Rendered ONLY in the
       * post-transition ThankYouPanel -- never before. */
      postPollCta: PartnerLinkSlot | null;
      /** See the signed-in variant's doc comment above. */
      sharePollLink: string | null;
      /** See the signed-in variant's doc comment above. */
      elaborationPrompts: ElaborationPrompt[];
    };

export default function RateForm(props: RateFormProps) {
  if (props.mode === "signed-in") return <SignedInRateForm {...props} />;
  return <AnonymousRateForm {...props} />;
}

const DEBOUNCE_MS = 600;

/** One debounced save per key (a questionId, or the fixed "details" key for
 * reviews/contact fields) -- a fresh change to the same key cancels and restarts its own
 * timer, never affecting any other key's pending save. Timers are cleared on unmount so
 * a component going away can't fire a save into a stale closure.
 *
 * Returns `[schedule, flushAll]`. `flushAll` runs every pending save NOW and awaits them
 * all; the submit handler must call it before POSTing. That matters most for the contact
 * email, which sits immediately above the submit button: typing an address and pressing
 * submit inside the 600ms window is the normal interaction, and without a flush the server
 * would read a still-null referenceEmail and silently skip creating the pending reference.
 * The stored closures already carry their own override values, so flushing can't write a
 * stale one. */
function useKeyedDebounce(delayMs: number) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, () => void | Promise<void>>());
  // Saves whose timer has already fired but whose request is still in flight. Tracking
  // these is what makes flushAll actually mean "everything has landed" -- see its comment.
  const inFlight = useRef(new Set<Promise<void>>());
  useEffect(
    () => () => {
      for (const t of timers.current.values()) clearTimeout(t);
    },
    []
  );

  const run = useCallback((fn: () => void | Promise<void>) => {
    const p = Promise.resolve()
      .then(fn)
      .catch(() => {})
      .finally(() => {
        inFlight.current.delete(p);
      });
    inFlight.current.add(p);
    return p;
  }, []);

  const schedule = useCallback(
    (key: string, fn: () => void | Promise<void>) => {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);
      pending.current.set(key, fn);
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          pending.current.delete(key);
          void run(fn);
        }, delayMs)
      );
    },
    [delayMs, run]
  );

  /**
   * Runs every not-yet-fired save NOW and waits until nothing is outstanding -- including
   * saves whose debounce already elapsed and whose request is still on the wire.
   *
   * That second half is the part that matters. An earlier version awaited only the pending
   * timers, so on a slow connection an answer that had already left the debounce but was
   * still mid-request was invisible here: submit raced ahead of it, the server evaluated
   * the readiness bar without that answer, and the respondent was told their response
   * didn't count -- moments before it silently did. Observed live with ~4-6s saves: the
   * last answer's PATCH completed *after* the submit POST.
   *
   * Loops because flushing a pending save creates new in-flight work.
   */
  const flushAll = useCallback(async () => {
    for (let i = 0; i < 10; i++) {
      const fns = [...pending.current.values()];
      for (const t of timers.current.values()) clearTimeout(t);
      timers.current.clear();
      pending.current.clear();
      fns.forEach((fn) => void run(fn));
      if (inFlight.current.size === 0) return;
      await Promise.all([...inFlight.current]);
      if (pending.current.size === 0 && inFlight.current.size === 0) return;
    }
  }, [run]);

  return [schedule, flushAll] as const;
}

/** Above the first review field, per the build spec -- plain context, not a legal
 * notice. Rendered once per form, immediately above its questions. */
function ReviewConsentContext() {
  return (
    <p className="text-xs text-muted">
      Reviews are published anonymously, reviewed by a moderator first, and may not be published at all.
    </p>
  );
}

/**
 * Renders the Core question list followed by each extra bucket (with its own group
 * heading) -- the single place "which questions render, in what order" lives, shared by
 * both SignedInRateForm and AnonymousRateForm so their question sets can never drift
 * apart. One continuous page -- no pagination, no step/wizard state.
 */
function QuestionSections({
  questions,
  extras,
  values,
  naFlags,
  reviewTexts,
  onValueChange,
  onNaChange,
  onReviewTextChange,
}: {
  questions: PollQuestionDTO[];
  extras: { bucket: PollBucketDTO; questions: PollQuestionDTO[] }[];
  values: Record<string, number | null>;
  naFlags: Record<string, boolean>;
  reviewTexts: Record<string, string>;
  onValueChange: (id: string, value: number | null) => void;
  onNaChange: (id: string, na: boolean) => void;
  onReviewTextChange: (id: string, text: string) => void;
}) {
  return (
    <div className="flex flex-col">
      {questions.map((q, i) => (
        <QuestionWithReview
          key={q.id}
          question={q}
          value={values[q.id]}
          onValueChange={(v) => onValueChange(q.id, v)}
          na={naFlags[q.id] ?? false}
          onNaChange={(na) => onNaChange(q.id, na)}
          reviewText={reviewTexts[q.id] ?? ""}
          onReviewTextChange={(text) => onReviewTextChange(q.id, text)}
          isFirst={i === 0}
        />
      ))}
      {extras.map(({ bucket, questions: bucketQuestions }) => (
        <div key={bucket.id} className="flex flex-col">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">{bucket.name}</p>
          {bucketQuestions.map((q) => (
            <QuestionWithReview
              key={q.id}
              question={q}
              value={values[q.id]}
              onValueChange={(v) => onValueChange(q.id, v)}
              na={naFlags[q.id] ?? false}
              onNaChange={(na) => onNaChange(q.id, na)}
              reviewText={reviewTexts[q.id] ?? ""}
              onReviewTextChange={(text) => onReviewTextChange(q.id, text)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The single, once-per-form consent checkbox for written comments -- gates `reviews`
 * only, never the rating/N/A fields. A comment typed without this checked is simply held
 * back from autosaving (never discarded from the textarea) until the box is checked, at
 * which point the next debounced save picks it up -- there's no submit to block anymore,
 * so `hint` is a persistent, non-blocking nudge rather than a submit-time error.
 */
function ReviewConsentCheckbox({
  checked,
  onChange,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-accent" />
        <span>I understand my written comments may be published publicly on this program&rsquo;s page after moderation.</span>
      </label>
      {hint && <p className="pl-6 text-xs text-muted">Check the box above to publish your written comments.</p>}
    </div>
  );
}

/**
 * How far through the poll the respondent is (item 10) -- answered counts a real value
 * *or* an explicit N/A, matching exactly what counts toward the readiness unlock bar
 * server-side, so this number and "did that last tap just unlock the response" never
 * disagree. Sticky below the entry header so it stays visible while scrolling a long
 * question list. Ink-navy, not brass -- the header hairline already spends this page's
 * brass budget (style guide §1's "no more than ~5% of a screen is brass"); every rating
 * control's selected state is ink-navy too, never brass (see SegmentedScale/StackedChoice).
 */
function ProgressIndicator({ answered, total }: { answered: number; total: number }) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="sticky top-[60px] z-30 border-b border-border bg-background py-2" role="status" aria-live="polite">
      <div className="h-0.5 w-full bg-border">
        <div className="h-full bg-primary transition-[width] duration-[120ms] ease-out" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 font-mono text-xs uppercase tracking-wide text-muted">
        {answered} of {total} answered
      </p>
    </div>
  );
}

/**
 * A bottom-docked shortcut to submit, carrying NO progress readout of its own (that lives
 * in ProgressIndicator, above, which does not overlay anything).
 *
 * It appears only once the respondent has scrolled past the last question (`tailReached`)
 * AND the inline submit is not itself on screen. That first condition exists because a
 * `position: sticky; bottom: 0` element floats over whatever is scrolled beneath it, which
 * meant an always-on bar sat across the middle of a question for the entire poll. Rendering
 * nothing until the questions are behind the respondent removes the overlap where it
 * matters and keeps the shortcut where it's useful. The second condition keeps the string
 * "Submit ratings" from ever appearing twice at once (style guide §7).
 *
 * `sticky`, never `fixed` -- iOS Safari's collapsing toolbar occludes fixed elements.
 */
function StickySubmitBar({
  visible,
  submitting,
  onSubmit,
}: {
  visible: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="sticky bottom-0 z-30 -mx-6 border-t border-border bg-background px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <Button
        type="button"
        className="min-h-11 w-full active:bg-accent-strong-hover"
        disabled={submitting}
        aria-busy={submitting}
        onClick={onSubmit}
      >
        {submitting ? "Submitting…" : "Submit ratings"}
      </Button>
    </div>
  );
}

/**
 * The primary submit affordance at the end of the poll. Never gated on completeness -- a
 * respondent who answered two questions may still submit, and the server records that
 * without counting it (see lib/pollResponses.ts's markSubmitted). `disabled` only ever
 * reflects an in-flight request, so a double-tap can't submit twice.
 *
 * `min-h-11` is the 44px touch target from style guide §6; Button's own `md` size is ~36px.
 * `active:` gives an immediate pressed state -- the handler sets `submitting` before it
 * validates anything, so a tap is always visibly registered even on the paths that end in
 * an error rather than a navigation.
 * `data-poll-submit` is the stable hook scripts/verify-share-thankyou.ts clicks, matching
 * the data-poll-question / data-poll-option / data-poll-share convention.
 */
function InlineSubmit({
  submitting,
  onSubmit,
  innerRef,
}: {
  submitting: boolean;
  onSubmit: () => void;
  innerRef: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={innerRef} className="flex flex-col gap-2">
      <Button
        type="button"
        data-poll-submit
        className="min-h-11 w-full active:bg-accent-strong-hover"
        disabled={submitting}
        aria-busy={submitting}
        onClick={onSubmit}
      >
        {submitting ? "Submitting…" : "Submit ratings"}
      </Button>
      <p className="text-xs text-muted">
        Your answers are already saved as you go — this finishes up and shows your program&rsquo;s progress.
      </p>
    </div>
  );
}

/**
 * A blocking problem the respondent has to know about, rendered wherever it happens rather
 * than swallowed. Clay/danger per style guide §2 (errors only). `role="alert"` so it's
 * announced the moment it appears -- a silent failure on a form someone just spent ten
 * minutes filling in is the worst outcome this component exists to prevent.
 */
function FormAlert({ message }: { message: string }) {
  return (
    <p data-poll-error role="alert" className="rounded border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

/** Watches the inline submit button and reports whether it's off screen, so the sticky bar
 * can show its own button only when the inline one isn't visible (never both -- §7). */
function useIsOffScreen(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const [offScreen, setOffScreen] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOffScreen(!entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return offScreen;
}

/** Latches true once the sentinel (placed just after the last question) has been reached,
 * and stays true -- the sticky submit shortcut shouldn't flicker away again if the
 * respondent scrolls back up to change an answer. */
function useHasReached(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const [reached, setReached] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setReached(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return reached;
}

/**
 * The confirmation headline, from the status the SERVER reported at submit. Three genuinely
 * different outcomes, and conflating any two of them tells the respondent something untrue:
 *
 * - COUNTED    -- it counts; the caller supplies the wording (it differs by mode/update).
 * - INCOMPLETE -- they submitted without covering enough of the poll. Say so plainly, since
 *                 the fix is in their hands: keep answering.
 * - FLAGGED    -- they answered plenty, but an anti-abuse signal (a repeat IP or browser on
 *                 this program) held the rating for review. Saying "only part of the poll
 *                 was answered" here would be flatly false, and detailing the heuristic
 *                 would just teach people how to route around it -- so this states the
 *                 outcome and nothing more.
 */
function thankYouHeadline({
  status,
  programName,
  countedText,
}: {
  status: string | null;
  programName: string;
  countedText: string;
}): string {
  if (status === "COUNTED") return countedText;
  if (status === "INCOMPLETE") {
    return `Thanks — your answers are saved. This one won't appear in ${programName}'s published ratings, since only part of the poll was answered.`;
  }
  return `Thanks — your rating of ${programName} has been saved and is being reviewed before it appears.`;
}

/** Copy for the two ways submit can fail, kept together so they stay consistent between
 * the two forms. `openFailed` is the serious one: nothing has been saved at all. */
const OPEN_FAILED_MESSAGE =
  "This rating form couldn't start, so nothing you enter is being saved. Reload the page to try again — if it keeps happening, the poll is temporarily unavailable.";
function submitFailedMessage(status?: number): string {
  return status
    ? `Submitting didn't go through (error ${status}). Your answers are saved — wait a moment and try again.`
    : "Submitting didn't go through — check your connection and try again. Your answers are saved.";
}

/**
 * The anonymous form's single contact-email opt-in. Entering an email under
 * POLL_REFERENCE_CONSENT_LABEL IS the consent to be listed as a reference -- there is NO
 * separate contact-consent checkbox. The 18+ self-attestation gates the field (disabled
 * until checked); both autosave (debounced) as typed, never blocking anything. Server-
 * side, a PENDING reference is created only once this response transitions to COUNTED
 * with 18+ attested and a valid email (lib/references.ts's upsertReferenceFromPoll).
 */
function ReferenceOptInBlock({
  email,
  onEmailChange,
  ageAttested,
  onAgeAttestedChange,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  ageAttested: boolean;
  onAgeAttestedChange: (ageAttested: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded border border-border p-3">
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" checked={ageAttested} onChange={(e) => onAgeAttestedChange(e.target.checked)} className="mt-1 accent-accent" />
        <span>I&rsquo;m 18 or older.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground">{POLL_REFERENCE_CONSENT_LABEL}</span>
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          disabled={!ageAttested}
        />
      </label>
    </div>
  );
}

/** localStorage key holding just the in-progress responseId (anonymous path only) --
 * replaces the old full-form-value draft now that the server autosaves every answer
 * itself; there's nothing left to reconstruct client-side except which response to
 * resume. */
function loadResumeId(programSlug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(pollDraftKey(programSlug));
  } catch {
    return null;
  }
}
function saveResumeId(programSlug: string, responseId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pollDraftKey(programSlug), responseId);
  } catch {
    // localStorage can throw (private browsing, quota) -- resuming a draft is a nicety,
    // never a hard requirement, so a failure here is swallowed rather than surfaced.
  }
}
// NOTE: there is deliberately no clearResumeId anymore. The key used to be wiped the
// instant a response crossed the readiness bar; keeping it is what lets a reload -- before
// OR after submit -- resume the same response rather than mint a duplicate one (the server
// side of that is openAnonymousResponse's relaxed status filter).

type OpenResult = {
  responseId: string;
  status: string;
  answers: Record<string, number>;
  naQuestionIds: string[];
  /** ISO string, or null when this respondent hasn't pressed Submit yet. */
  submittedAt: string | null;
};

function SignedInRateForm({
  programId,
  programName,
  questions,
  extras,
  existingAnswers,
  existingNaQuestionIds,
  postPollCta,
  sharePollLink,
  elaborationPrompts,
}: Extract<RateFormProps, { mode: "signed-in" }>) {
  const router = useRouter();
  const isUpdate = existingAnswers !== undefined;
  const allQuestions = [...questions, ...extras.flatMap((e) => e.questions)];
  const [values, setValues] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(allQuestions.map((q) => [q.id, existingAnswers?.[q.id] ?? null]))
  );
  const [naFlags, setNaFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allQuestions.map((q) => [q.id, existingNaQuestionIds?.includes(q.id) ?? false]))
  );
  const [reviewTexts, setReviewTexts] = useState<Record<string, string>>({});
  const [consentGiven, setConsentGiven] = useState(false);
  const [referenceEmail, setReferenceEmail] = useState("");
  const [ageAttested, setAgeAttested] = useState(false);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<string>("INCOMPLETE");
  const inlineSubmitRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const inlineSubmitOffScreen = useIsOffScreen(inlineSubmitRef);
  const tailReached = useHasReached(tailRef);
  const [schedule, flushAll] = useKeyedDebounce(DEBOUNCE_MS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/polls/responses/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId }),
    })
      .then(async (res) => ({ ok: res.ok, body: (await res.json()) as OpenResult }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        // A failed open means autosave can never start -- every save handler no-ops
        // without a responseId. Surfacing it is not optional: silently rendering a form
        // that discards everything typed into it is the worst failure mode this page has.
        if (!ok || !body?.responseId) {
          setError(OPEN_FAILED_MESSAGE);
          return;
        }
        setResponseId(body.responseId);
        statusRef.current = body.status;
        if (Object.keys(body.answers).length > 0) {
          setValues((prev) => ({ ...prev, ...body.answers }));
        }
        if (body.naQuestionIds.length > 0) {
          setNaFlags((prev) => {
            const next = { ...prev };
            for (const id of body.naQuestionIds) next[id] = true;
            return next;
          });
        }
      })
      .catch(() => {
        if (!cancelled) setError(OPEN_FAILED_MESSAGE);
      });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  /** Tracks the server's view of this response's status. It no longer routes anywhere:
   * crossing the readiness bar used to replace the whole form with the thank-you screen
   * mid-poll (losing every remaining question), and the explicit Submit button is now the
   * only thing that ends the form. */
  function applyStatus(nextStatus: string) {
    statusRef.current = nextStatus;
  }

  async function saveAnswerToServer(questionId: string, value: number | null, na: boolean) {
    if (!responseId) return;
    try {
      const res = await fetch(`/api/polls/responses/${responseId}/answer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, value, na }),
      });
      if (!res.ok) return;
      const body = await res.json();
      applyStatus(body.status);
      router.refresh();
    } catch {
      // Best-effort autosave -- a transient network failure just means this one answer
      // didn't save; the next change (or a page reload once online) retries it.
    }
  }

  async function saveDetailsToServer(
    overrides: {
      reviewTexts?: Record<string, string>;
      consentGiven?: boolean;
      referenceEmail?: string;
      ageAttested?: boolean;
    } = {}
  ) {
    if (!responseId) return;
    const effectiveReviewTexts = overrides.reviewTexts ?? reviewTexts;
    const effectiveConsent = overrides.consentGiven ?? consentGiven;
    const effectiveReferenceEmail = overrides.referenceEmail ?? referenceEmail;
    const effectiveAgeAttested = overrides.ageAttested ?? ageAttested;
    const reviews = effectiveConsent
      ? allQuestions
          .filter((q) => effectiveReviewTexts[q.id]?.trim())
          .map((q) => ({ questionId: q.id, text: effectiveReviewTexts[q.id].trim(), consent: true as const }))
      : [];
    try {
      const res = await fetch(`/api/polls/responses/${responseId}/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: [],
          reviews,
          naQuestionIds: [],
          referenceEmail: effectiveReferenceEmail.trim() || undefined,
          ageAttested: effectiveAgeAttested || undefined,
        }),
      });
      if (!res.ok) return;
      const body = await res.json();
      if (body.status) applyStatus(body.status);
      router.refresh();
    } catch {
      // Best-effort, same posture as saveAnswerToServer.
    }
  }

  /**
   * Explicit submit. Saves nothing itself -- it flushes whatever autosave still has in
   * flight (critically the contact email, which sits right above the button, so typing it
   * and pressing submit inside the 600ms debounce is the normal case), then stamps
   * submittedAt server-side and routes to the thank-you screen. The headline is driven by
   * the status the SERVER reports back, never by statusRef, so a still-settling save can't
   * make it claim a rating was recorded when it wasn't.
   *
   * `submitting` is set BEFORE any validation, so every tap produces immediate visible
   * feedback and every path that doesn't navigate ends in a visible message. There is no
   * branch here that returns silently -- an earlier version returned early on a missing
   * responseId, which is exactly how a broken poll-open turned into a submit button that
   * looked like it did nothing at all.
   */
  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    if (!responseId) {
      setError(OPEN_FAILED_MESSAGE);
      setSubmitting(false);
      return;
    }
    try {
      await flushAll();
      const res = await fetch(`/api/polls/responses/${responseId}/submit`, { method: "POST" });
      if (!res.ok) {
        setError(submitFailedMessage(res.status));
        setSubmitting(false);
        return;
      }
      const body = await res.json();
      applyStatus(body.status);
      setSubmittedStatus(body.status);
      setJustCompleted(true);
      router.refresh();
    } catch {
      setError(submitFailedMessage());
      setSubmitting(false);
    }
  }

  /** Back to the form from the confirmation. Answers live in this component's state (and
   * on the server), so nothing is lost; `submittedAt` deliberately stays set, since they
   * did submit -- re-submitting later is idempotent and keeps the original stamp. */
  function handleKeepAnswering() {
    setJustCompleted(false);
    setSubmitting(false);
    setError(null);
  }

  function handleValueChange(id: string, v: number | null) {
    setValues((prev) => ({ ...prev, [id]: v }));
    schedule(`answer:${id}`, () => saveAnswerToServer(id, v, false));
  }
  function handleNaChange(id: string, na: boolean) {
    setNaFlags((prev) => ({ ...prev, [id]: na }));
    if (na) setValues((prev) => ({ ...prev, [id]: null }));
    schedule(`answer:${id}`, () => saveAnswerToServer(id, null, na));
  }
  function handleReviewTextChange(id: string, text: string) {
    const next = { ...reviewTexts, [id]: text };
    setReviewTexts(next);
    schedule("details", () => saveDetailsToServer({ reviewTexts: next }));
  }
  function handleConsentChange(checked: boolean) {
    setConsentGiven(checked);
    schedule("details", () => saveDetailsToServer({ consentGiven: checked }));
  }
  function handleEmailChange(email: string) {
    setReferenceEmail(email);
    schedule("details", () => saveDetailsToServer({ referenceEmail: email }));
  }
  function handleAgeAttestedChange(next: boolean) {
    setAgeAttested(next);
    // Un-attesting age disables and clears the email -- an email must never be sent
    // without the 18+ affirmation that gates it.
    const nextEmail = next ? referenceEmail : "";
    if (!next) setReferenceEmail("");
    schedule("details", () => saveDetailsToServer({ ageAttested: next, referenceEmail: nextEmail }));
  }

  if (justCompleted) {
    const counted = submittedStatus === "COUNTED";
    return (
      <ThankYouPanel
        mode="signed-in"
        programId={programId}
        programName={programName}
        responseId={responseId}
        sharePollLink={sharePollLink}
        counted={counted}
        incomplete={submittedStatus === "INCOMPLETE"}
        headline={thankYouHeadline({
          status: submittedStatus,
          programName,
          countedText: isUpdate ? "Your rating has been updated." : "Thanks for rating this program.",
        })}
        postPollCta={postPollCta}
        onKeepAnswering={handleKeepAnswering}
      />
    );
  }

  const answeredCount = allQuestions.filter((q) => values[q.id] !== null || naFlags[q.id]).length;

  return (
    <div data-poll-mode="signed-in" className="flex flex-col gap-6">
      <ProgressIndicator answered={answeredCount} total={allQuestions.length} />
      {error && <FormAlert message={error} />}
      <ReviewConsentContext />
      <QuestionSections
        questions={questions}
        extras={extras}
        values={values}
        naFlags={naFlags}
        reviewTexts={reviewTexts}
        onValueChange={handleValueChange}
        onNaChange={handleNaChange}
        onReviewTextChange={handleReviewTextChange}
      />
      <ReviewConsentCheckbox
        checked={consentGiven}
        onChange={handleConsentChange}
        hint={!consentGiven && Object.values(reviewTexts).some((t) => t.trim().length > 0)}
      />
      <ReferenceOptInBlock
        email={referenceEmail}
        onEmailChange={handleEmailChange}
        ageAttested={ageAttested}
        onAgeAttestedChange={handleAgeAttestedChange}
      />
      <ElaborationBlock responseId={responseId} prompts={elaborationPrompts} />
      {/* Sentinel sits BELOW the contact-email block AND the elaboration block on purpose.
          The sticky submit shortcut must not become tappable while either is still under
          the fold, or a respondent can submit having never laid eyes on them -- which is
          how the reference pipeline produced nothing for five weeks. Everything below here
          is genuinely the end of the form, so the shortcut can appear without floating
          across content. */}
      <div ref={tailRef} aria-hidden="true" />
      {error && <FormAlert message={error} />}
      <InlineSubmit submitting={submitting} onSubmit={handleSubmit} innerRef={inlineSubmitRef} />
      <StickySubmitBar
        visible={tailReached && inlineSubmitOffScreen}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function AnonymousRateForm({
  programId,
  programSlug,
  programName,
  referrerToken,
  questions,
  extras,
  postPollCta,
  sharePollLink,
  elaborationPrompts,
}: Extract<RateFormProps, { mode: "anonymous" }>) {
  const router = useRouter();
  const allQuestions = [...questions, ...extras.flatMap((e) => e.questions)];
  const [values, setValues] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(allQuestions.map((q) => [q.id, null]))
  );
  const [naFlags, setNaFlags] = useState<Record<string, boolean>>({});
  const [reviewTexts, setReviewTexts] = useState<Record<string, string>>({});
  const [consentGiven, setConsentGiven] = useState(false);
  const [yearAttended, setYearAttended] = useState<number | null>(null);
  const [referenceEmail, setReferenceEmail] = useState("");
  const [ageAttested, setAgeAttested] = useState(false);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<string>("INCOMPLETE");
  const inlineSubmitRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const inlineSubmitOffScreen = useIsOffScreen(inlineSubmitRef);
  const tailReached = useHasReached(tailRef);
  const [schedule, flushAll] = useKeyedDebounce(DEBOUNCE_MS);

  useEffect(() => {
    let cancelled = false;
    const resumeId = loadResumeId(programSlug) ?? undefined;
    fetch("/api/polls/responses/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, ref: referrerToken, resumeId }),
    })
      .then(async (res) => ({ ok: res.ok, body: (await res.json()) as OpenResult }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        // See SignedInRateForm's identical guard -- a failed open means every autosave
        // silently discards what the respondent types, so it must be visible.
        if (!ok || !body?.responseId) {
          setError(OPEN_FAILED_MESSAGE);
          return;
        }
        setResponseId(body.responseId);
        statusRef.current = body.status;
        saveResumeId(programSlug, body.responseId);
        // Already submitted (a reload, or a shared device coming back to the same link):
        // go straight back to the confirmation rather than handing them a blank form that
        // would look like their submission vanished. The resume key is deliberately kept,
        // not cleared, which is what makes this idempotent across reloads.
        // Restore saved state BEFORE deciding whether to show the confirmation. Returning
        // early here (as this did originally) meant that pressing "Keep answering" after a
        // reload handed back an empty form, even though every answer was safe on the
        // server -- the exact opposite of what the button promises.
        if (Object.keys(body.answers).length > 0) {
          setValues((prev) => ({ ...prev, ...body.answers }));
        }
        if (body.naQuestionIds.length > 0) {
          setNaFlags((prev) => {
            const next = { ...prev };
            for (const id of body.naQuestionIds) next[id] = true;
            return next;
          });
        }
        if (body.submittedAt) {
          setSubmittedStatus(body.status);
          setJustCompleted(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(OPEN_FAILED_MESSAGE);
      });
    return () => {
      cancelled = true;
    };
  }, [programId, programSlug, referrerToken]);

  /** See SignedInRateForm's identical note: crossing the readiness bar no longer routes
   * anywhere. Nor does it clear the resume key -- keeping the key is exactly what lets a
   * mid-poll reload resume the same response instead of minting a duplicate. */
  function applyStatus(nextStatus: string) {
    statusRef.current = nextStatus;
  }

  async function saveAnswerToServer(questionId: string, value: number | null, na: boolean) {
    if (!responseId) return;
    try {
      const res = await fetch(`/api/polls/responses/${responseId}/answer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, value, na }),
      });
      if (!res.ok) return;
      const body = await res.json();
      applyStatus(body.status);
      router.refresh();
    } catch {
      // Best-effort, see SignedInRateForm's identical catch.
    }
  }

  async function saveDetailsToServer(
    overrides: {
      reviewTexts?: Record<string, string>;
      consentGiven?: boolean;
      yearAttended?: number | null;
      referenceEmail?: string;
      ageAttested?: boolean;
    } = {}
  ) {
    if (!responseId) return;
    const effectiveReviewTexts = overrides.reviewTexts ?? reviewTexts;
    const effectiveConsent = overrides.consentGiven ?? consentGiven;
    const effectiveYearAttended = overrides.yearAttended !== undefined ? overrides.yearAttended : yearAttended;
    const effectiveReferenceEmail = overrides.referenceEmail ?? referenceEmail;
    const effectiveAgeAttested = overrides.ageAttested ?? ageAttested;
    const reviews = effectiveConsent
      ? allQuestions
          .filter((q) => effectiveReviewTexts[q.id]?.trim())
          .map((q) => ({ questionId: q.id, text: effectiveReviewTexts[q.id].trim(), consent: true as const }))
      : [];
    try {
      const res = await fetch(`/api/polls/responses/${responseId}/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: [],
          reviews,
          naQuestionIds: [],
          yearAttended: effectiveYearAttended,
          referenceEmail: effectiveReferenceEmail.trim() || undefined,
          ageAttested: effectiveAgeAttested || undefined,
        }),
      });
      if (!res.ok) return;
      const body = await res.json();
      if (body.status) applyStatus(body.status);
      router.refresh();
    } catch {
      // Best-effort, see saveAnswerToServer.
    }
  }

  /** See SignedInRateForm's handleSubmit -- identical contract, including that no branch
   * here may return without either navigating or surfacing a message. */
  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    if (!responseId) {
      setError(OPEN_FAILED_MESSAGE);
      setSubmitting(false);
      return;
    }
    try {
      await flushAll();
      const res = await fetch(`/api/polls/responses/${responseId}/submit`, { method: "POST" });
      if (!res.ok) {
        setError(submitFailedMessage(res.status));
        setSubmitting(false);
        return;
      }
      const body = await res.json();
      applyStatus(body.status);
      setSubmittedStatus(body.status);
      setJustCompleted(true);
      router.refresh();
    } catch {
      setError(submitFailedMessage());
      setSubmitting(false);
    }
  }

  /** Back to the form from the confirmation. Answers live in this component's state (and
   * on the server), so nothing is lost; `submittedAt` deliberately stays set, since they
   * did submit -- re-submitting later is idempotent and keeps the original stamp. */
  function handleKeepAnswering() {
    setJustCompleted(false);
    setSubmitting(false);
    setError(null);
  }

  function handleValueChange(id: string, v: number | null) {
    setValues((prev) => ({ ...prev, [id]: v }));
    schedule(`answer:${id}`, () => saveAnswerToServer(id, v, false));
  }
  function handleNaChange(id: string, na: boolean) {
    setNaFlags((prev) => ({ ...prev, [id]: na }));
    if (na) setValues((prev) => ({ ...prev, [id]: null }));
    schedule(`answer:${id}`, () => saveAnswerToServer(id, null, na));
  }
  function handleReviewTextChange(id: string, text: string) {
    const next = { ...reviewTexts, [id]: text };
    setReviewTexts(next);
    schedule("details", () => saveDetailsToServer({ reviewTexts: next }));
  }
  function handleConsentChange(checked: boolean) {
    setConsentGiven(checked);
    schedule("details", () => saveDetailsToServer({ consentGiven: checked }));
  }
  function handleYearAttendedChange(year: number | null) {
    setYearAttended(year);
    schedule("details", () => saveDetailsToServer({ yearAttended: year }));
  }
  function handleEmailChange(email: string) {
    setReferenceEmail(email);
    schedule("details", () => saveDetailsToServer({ referenceEmail: email }));
  }
  function handleAgeAttestedChange(next: boolean) {
    setAgeAttested(next);
    // Un-attesting age disables and clears the email -- an email must never be sent
    // without the 18+ affirmation that gates it.
    const nextEmail = next ? referenceEmail : "";
    if (!next) setReferenceEmail("");
    schedule("details", () => saveDetailsToServer({ ageAttested: next, referenceEmail: nextEmail }));
  }

  if (justCompleted) {
    const counted = submittedStatus === "COUNTED";
    return (
      <ThankYouPanel
        mode="anonymous"
        programId={programId}
        programName={programName}
        responseId={responseId}
        sharePollLink={sharePollLink}
        counted={counted}
        incomplete={submittedStatus === "INCOMPLETE"}
        headline={thankYouHeadline({
          status: submittedStatus,
          programName,
          countedText: `Thanks — your rating of ${programName} has been recorded.`,
        })}
        postPollCta={postPollCta}
        onKeepAnswering={handleKeepAnswering}
      />
    );
  }

  const answeredCount = allQuestions.filter((q) => values[q.id] !== null || naFlags[q.id]).length;

  return (
    <div data-poll-mode="anonymous" className="flex flex-col gap-6">
      <ProgressIndicator answered={answeredCount} total={allQuestions.length} />
      {error && <FormAlert message={error} />}
      <ReviewConsentContext />
      <QuestionSections
        questions={questions}
        extras={extras}
        values={values}
        naFlags={naFlags}
        reviewTexts={reviewTexts}
        onValueChange={handleValueChange}
        onNaChange={handleNaChange}
        onReviewTextChange={handleReviewTextChange}
      />
      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm font-medium text-foreground">When did you attend? (optional)</span>
        <Select value={yearAttended ?? ""} onChange={(e) => handleYearAttendedChange(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Prefer not to say</option>
          {yearAttendedOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </label>
      <ReviewConsentCheckbox
        checked={consentGiven}
        onChange={handleConsentChange}
        hint={!consentGiven && Object.values(reviewTexts).some((t) => t.trim().length > 0)}
      />
      <ReferenceOptInBlock
        email={referenceEmail}
        onEmailChange={handleEmailChange}
        ageAttested={ageAttested}
        onAgeAttestedChange={handleAgeAttestedChange}
      />
      <ElaborationBlock responseId={responseId} prompts={elaborationPrompts} />
      {/* Sentinel sits BELOW the contact-email block AND the elaboration block on purpose
          -- see SignedInRateForm's identical note. */}
      <div ref={tailRef} aria-hidden="true" />
      {error && <FormAlert message={error} />}
      <InlineSubmit submitting={submitting} onSubmit={handleSubmit} innerRef={inlineSubmitRef} />
      <StickySubmitBar
        visible={tailReached && inlineSubmitOffScreen}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

