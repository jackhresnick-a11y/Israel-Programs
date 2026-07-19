"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Card from "@/components/ui/Card";
import QuestionInput from "@/components/polls/QuestionInput";
import { pollDraftKey, yearAttendedOptions, type PollQuestionDTO, type PollBucketDTO } from "@/lib/pollShared";

type RateFormProps =
  | {
      mode: "signed-in";
      programId: string;
      questions: PollQuestionDTO[];
      existingAnswers?: Record<string, number>;
      existingNaQuestionIds?: string[];
    }
  | {
      mode: "anonymous";
      programId: string;
      programSlug: string;
      programName: string;
      referrerToken: string;
      questions: PollQuestionDTO[];
      extras: { bucket: PollBucketDTO; questions: PollQuestionDTO[] }[];
    };

export default function RateForm(props: RateFormProps) {
  if (props.mode === "signed-in") return <SignedInRateForm {...props} />;
  return <AnonymousRateForm {...props} />;
}

const EMPTY_SUBMISSION_MESSAGE = "Answer at least one question or write a review";

/** Above the first review field, per the build spec -- plain context, not a legal
 * notice. Rendered once per form/expander section, immediately above its questions. */
function ReviewConsentContext() {
  return (
    <p className="text-xs text-muted">
      Reviews are published anonymously, reviewed by a moderator first, and may not be published at all.
    </p>
  );
}

/**
 * One question's rating control plus its optional review textarea and per-review
 * consent checkbox -- the same composite renders in the core form, the anonymous
 * thank-you screen's "Add more detail" expander, and (via SignedInRateForm) the
 * signed-in form, so review UX never drifts between the three. An unchecked consent
 * box means the review simply isn't included in the submission -- never sent as
 * `consent: false` (the rating and every other field on the page submit regardless).
 */
function QuestionWithReview({
  question,
  value,
  onValueChange,
  na,
  onNaChange,
  reviewText,
  onReviewTextChange,
  reviewConsent,
  onReviewConsentChange,
}: {
  question: PollQuestionDTO;
  value: number | null;
  onValueChange: (value: number | null) => void;
  na: boolean;
  onNaChange: (na: boolean) => void;
  reviewText: string;
  onReviewTextChange: (text: string) => void;
  reviewConsent: boolean;
  onReviewConsentChange: (consent: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <QuestionInput question={question} value={value} onChange={onValueChange} na={na} onNaChange={onNaChange} />
      <div className="flex flex-col gap-1.5 pl-1">
        <Textarea
          placeholder="Want to say more? (optional)"
          value={reviewText}
          onChange={(e) => onReviewTextChange(e.target.value)}
          maxLength={1000}
          rows={2}
          className="text-sm"
        />
        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={reviewConsent}
            onChange={(e) => onReviewConsentChange(e.target.checked)}
            className="mt-0.5 accent-accent"
          />
          <span>I understand this will be published publicly on this program&rsquo;s page.</span>
        </label>
      </div>
    </div>
  );
}

/** Builds the {questionId, value}[] / {questionId, text, consent}[] / string[] payloads
 * from per-question state -- a skipped question (value null, not N/A'd) is simply
 * absent from `answers`; an N/A'd question is excluded from `answers` (defensively,
 * even though checking N/A already clears `values[q.id]` via QuestionInput's
 * toggleNa) and instead listed in `naQuestionIds`; a review only makes it into
 * `reviews` when both text and consent are present, an unchecked or empty review is
 * silently excluded, never sent flagged. */
function buildSubmission(
  questions: PollQuestionDTO[],
  values: Record<string, number | null>,
  naValues: Record<string, boolean>,
  reviewTexts: Record<string, string>,
  reviewConsents: Record<string, boolean>
) {
  const answers = questions
    .filter((q) => values[q.id] !== null && !naValues[q.id])
    .map((q) => ({ questionId: q.id, value: values[q.id] as number }));
  const naQuestionIds = questions.filter((q) => naValues[q.id]).map((q) => q.id);
  const reviews = questions
    .filter((q) => reviewConsents[q.id] && reviewTexts[q.id]?.trim())
    .map((q) => ({ questionId: q.id, text: reviewTexts[q.id].trim(), consent: true as const }));
  return { answers, naQuestionIds, reviews };
}

function SignedInRateForm({
  programId,
  questions,
  existingAnswers,
  existingNaQuestionIds,
}: Extract<RateFormProps, { mode: "signed-in" }>) {
  const router = useRouter();
  const isUpdate = existingAnswers !== undefined;
  const [values, setValues] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, existingAnswers?.[q.id] ?? null]))
  );
  const [naFlags, setNaFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, existingNaQuestionIds?.includes(q.id) ?? false]))
  );
  const [reviewTexts, setReviewTexts] = useState<Record<string, string>>({});
  const [reviewConsents, setReviewConsents] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    const { answers, naQuestionIds, reviews } = buildSubmission(questions, values, naFlags, reviewTexts, reviewConsents);
    if (answers.length === 0 && reviews.length === 0) {
      setError(EMPTY_SUBMISSION_MESSAGE);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/polls/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, answers, naQuestionIds, reviews }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to submit rating");
      }
      setSubmitted(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div
        data-poll-mode="signed-in"
        className="rounded-xl border border-success/30 bg-success-bg p-6 text-center text-sm font-medium text-success"
      >
        {isUpdate ? "Your rating has been updated." : "Thanks for rating this program!"}
      </div>
    );
  }

  return (
    <div data-poll-mode="signed-in" className="flex flex-col gap-6">
      {error && <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}
      <ReviewConsentContext />
      {questions.map((q) => (
        <QuestionWithReview
          key={q.id}
          question={q}
          value={values[q.id]}
          onValueChange={(v) => setValues((prev) => ({ ...prev, [q.id]: v }))}
          na={naFlags[q.id] ?? false}
          onNaChange={(na) => setNaFlags((prev) => ({ ...prev, [q.id]: na }))}
          reviewText={reviewTexts[q.id] ?? ""}
          onReviewTextChange={(text) => setReviewTexts((prev) => ({ ...prev, [q.id]: text }))}
          reviewConsent={reviewConsents[q.id] ?? false}
          onReviewConsentChange={(consent) => setReviewConsents((prev) => ({ ...prev, [q.id]: consent }))}
        />
      ))}
      <Button type="button" disabled={submitting} onClick={handleSubmit} className="self-start">
        {submitting ? "Submitting..." : isUpdate ? "Update rating" : "Submit rating"}
      </Button>
    </div>
  );
}

type Draft = {
  values: Record<string, number | null>;
  naFlags: Record<string, boolean>;
  reviewTexts: Record<string, string>;
  yearAttended: number | null;
};

function loadDraft(programSlug: string): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(pollDraftKey(programSlug));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function saveDraft(programSlug: string, draft: Draft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pollDraftKey(programSlug), JSON.stringify(draft));
  } catch {
    // localStorage can throw (private browsing, quota) -- autosave is a nicety, never a
    // hard requirement, so a failure here is swallowed rather than surfaced.
  }
}

function clearDraft(programSlug: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(pollDraftKey(programSlug));
  } catch {
    // See saveDraft.
  }
}

// Same useSyncExternalStore pattern as components/ThemeToggle.tsx for reading a
// browser-only value without a hydration mismatch: the server (and React's initial
// client hydration pass) always sees getServerSnapshot's null, and the real draft
// arrives one tick later on the client -- no useEffect+setState needed to "load" it.
// Cached per programSlug so getSnapshot returns a referentially stable value (a fresh
// JSON.parse on every call would otherwise fail useSyncExternalStore's equality check).
const draftCache = new Map<string, Draft | null>();

function subscribeNoop() {
  return () => {};
}

function getServerDraftSnapshot(): Draft | null {
  return null;
}

function useSavedDraft(programSlug: string): Draft | null {
  return useSyncExternalStore(
    subscribeNoop,
    () => {
      if (!draftCache.has(programSlug)) draftCache.set(programSlug, loadDraft(programSlug));
      return draftCache.get(programSlug) ?? null;
    },
    getServerDraftSnapshot
  );
}

function AnonymousRateForm({
  programId,
  programSlug,
  programName,
  referrerToken,
  questions,
  extras,
}: Extract<RateFormProps, { mode: "anonymous" }>) {
  // Every question starts unanswered (null), same as the signed-in form -- this
  // supersedes the earlier "pre-position at 3" design, which made an untouched
  // question indistinguishable from a real answer of 3. The very first render (both
  // on the server and React's initial client hydration pass) always starts from this
  // default -- a saved draft, if any, arrives via useSavedDraft one tick later and is
  // applied below during render (React's "adjusting state when a store value changes"
  // pattern), not inside an effect, so there's no hydration mismatch and no
  // setState-in-effect cascade.
  const [values, setValues] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, null]))
  );
  const [naFlags, setNaFlags] = useState<Record<string, boolean>>({});
  const [reviewTexts, setReviewTexts] = useState<Record<string, string>>({});
  // Consent is deliberately NOT persisted to the draft (see saveDraft's payload below)
  // -- restoring a draft always starts every consent box unchecked, even if it was
  // checked before the page reloaded. Review *text* is preserved so nothing is lost,
  // but re-affirming consent is a fresh, deliberate act every time. N/A marks *are*
  // persisted -- unlike consent, checking N/A isn't a legal affirmation, just a data
  // choice, so there's no reason to make the respondent re-mark it after a reload.
  const [reviewConsents, setReviewConsents] = useState<Record<string, boolean>>({});
  const [yearAttended, setYearAttended] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);

  const savedDraft = useSavedDraft(programSlug);
  const [appliedDraft, setAppliedDraft] = useState<Draft | null>(null);
  if (savedDraft !== null && savedDraft !== appliedDraft) {
    setAppliedDraft(savedDraft);
    setValues((prev) => ({ ...prev, ...savedDraft.values }));
    setNaFlags((prev) => ({ ...prev, ...savedDraft.naFlags }));
    setReviewTexts((prev) => ({ ...prev, ...savedDraft.reviewTexts }));
    if (savedDraft.yearAttended !== null && savedDraft.yearAttended !== undefined) {
      setYearAttended(savedDraft.yearAttended);
    }
  }

  useEffect(() => {
    if (responseId) return; // already submitted -- stop autosaving over a cleared draft
    saveDraft(programSlug, { values, naFlags, reviewTexts, yearAttended });
  }, [programSlug, values, naFlags, reviewTexts, yearAttended, responseId]);

  async function handleSubmit() {
    const { answers, naQuestionIds, reviews } = buildSubmission(questions, values, naFlags, reviewTexts, reviewConsents);
    if (answers.length === 0 && reviews.length === 0) {
      setError(EMPTY_SUBMISSION_MESSAGE);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/polls/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          ref: referrerToken,
          answers,
          naQuestionIds,
          reviews,
          yearAttended,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to submit rating");
      }
      const body = await res.json();
      setResponseId(body.responseId);
      clearDraft(programSlug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (responseId) {
    return <ThankYouScreen responseId={responseId} programName={programName} extras={extras} />;
  }

  return (
    <div data-poll-mode="anonymous" className="flex flex-col gap-6">
      {error && <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}
      <ReviewConsentContext />
      {questions.map((q) => (
        <QuestionWithReview
          key={q.id}
          question={q}
          value={values[q.id]}
          onValueChange={(v) => setValues((prev) => ({ ...prev, [q.id]: v }))}
          na={naFlags[q.id] ?? false}
          onNaChange={(na) => setNaFlags((prev) => ({ ...prev, [q.id]: na }))}
          reviewText={reviewTexts[q.id] ?? ""}
          onReviewTextChange={(text) => setReviewTexts((prev) => ({ ...prev, [q.id]: text }))}
          reviewConsent={reviewConsents[q.id] ?? false}
          onReviewConsentChange={(consent) => setReviewConsents((prev) => ({ ...prev, [q.id]: consent }))}
        />
      ))}
      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm font-medium text-foreground">When did you attend? (optional)</span>
        <Select
          value={yearAttended ?? ""}
          onChange={(e) => setYearAttended(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Prefer not to say</option>
          {yearAttendedOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </label>
      <Button type="button" disabled={submitting} onClick={handleSubmit} className="self-start">
        {submitting ? "Submitting..." : "Submit rating"}
      </Button>
    </div>
  );
}

function ThankYouScreen({
  responseId,
  programName,
  extras,
}: {
  responseId: string;
  programName: string;
  extras: { bucket: PollBucketDTO; questions: PollQuestionDTO[] }[];
}) {
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  const extraQuestions = extras.flatMap((e) => e.questions);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailValues, setDetailValues] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(extraQuestions.map((q) => [q.id, null]))
  );
  const [detailNaFlags, setDetailNaFlags] = useState<Record<string, boolean>>({});
  const [detailReviewTexts, setDetailReviewTexts] = useState<Record<string, string>>({});
  const [detailReviewConsents, setDetailReviewConsents] = useState<Record<string, boolean>>({});
  const [detailStatus, setDetailStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleConfirmEmail() {
    setEmailStatus("sending");
    setEmailError(null);
    try {
      const res = await fetch(`/api/polls/responses/${responseId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to send verification email");
      }
      setEmailStatus("sent");
    } catch (err) {
      setEmailStatus("error");
      setEmailError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleSaveDetail() {
    const { answers, naQuestionIds, reviews } = buildSubmission(
      extraQuestions,
      detailValues,
      detailNaFlags,
      detailReviewTexts,
      detailReviewConsents
    );
    if (answers.length === 0 && naQuestionIds.length === 0 && reviews.length === 0) {
      setDetailStatus("saved");
      return;
    }
    setDetailStatus("saving");
    try {
      const res = await fetch(`/api/polls/responses/${responseId}/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, naQuestionIds, reviews }),
      });
      if (!res.ok) throw new Error();
      setDetailStatus("saved");
    } catch {
      setDetailStatus("error");
    }
  }

  return (
    <div data-poll-mode="anonymous" className="flex flex-col gap-4">
      <div className="rounded-xl border border-success/30 bg-success-bg p-6 text-center text-sm font-medium text-success">
        Thanks for rating {programName}!
      </div>

      {emailStatus === "sent" ? (
        <Card className="p-4 text-sm text-success">Check your inbox to confirm -- once verified, your rating counts toward the public score.</Card>
      ) : (
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-sm font-medium text-foreground">
            Want your rating to count toward the public score?
          </p>
          <p className="text-xs text-muted">Confirm your email and we&rsquo;ll send a one-click verification link. Totally optional.</p>
          {emailError && <p className="text-xs text-danger">{emailError}</p>}
          <div className="flex flex-wrap gap-2">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!email.trim() || emailStatus === "sending"}
              onClick={handleConfirmEmail}
            >
              {emailStatus === "sending" ? "Sending..." : "Confirm your email"}
            </Button>
          </div>
        </Card>
      )}

      {extras.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setDetailOpen((o) => !o)}>
            {detailOpen ? "Hide extra questions" : "Add more detail"}
          </Button>
          {detailOpen && (
            <Card className="flex flex-col gap-6 p-4">
              {detailStatus === "saved" ? (
                <p className="text-sm text-success">Thanks -- saved.</p>
              ) : (
                <>
                  <ReviewConsentContext />
                  {extras.map(({ bucket, questions }) => (
                    <div key={bucket.id} className="flex flex-col gap-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{bucket.name}</p>
                      {questions.map((q) => (
                        <QuestionWithReview
                          key={q.id}
                          question={q}
                          value={detailValues[q.id]}
                          onValueChange={(v) => setDetailValues((prev) => ({ ...prev, [q.id]: v }))}
                          na={detailNaFlags[q.id] ?? false}
                          onNaChange={(na) => setDetailNaFlags((prev) => ({ ...prev, [q.id]: na }))}
                          reviewText={detailReviewTexts[q.id] ?? ""}
                          onReviewTextChange={(text) => setDetailReviewTexts((prev) => ({ ...prev, [q.id]: text }))}
                          reviewConsent={detailReviewConsents[q.id] ?? false}
                          onReviewConsentChange={(consent) =>
                            setDetailReviewConsents((prev) => ({ ...prev, [q.id]: consent }))
                          }
                        />
                      ))}
                    </div>
                  ))}
                  <Button type="button" size="sm" className="self-start" disabled={detailStatus === "saving"} onClick={handleSaveDetail}>
                    {detailStatus === "saving" ? "Saving..." : "Save additional details"}
                  </Button>
                </>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
