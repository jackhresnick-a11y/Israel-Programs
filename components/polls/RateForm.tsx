"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import QuestionInput from "@/components/polls/QuestionInput";
import { pollDraftKey, yearAttendedOptions, type PollQuestionDTO, type PollBucketDTO } from "@/lib/pollShared";

type RateFormProps =
  | {
      mode: "signed-in";
      programId: string;
      questions: PollQuestionDTO[];
      extras: { bucket: PollBucketDTO; questions: PollQuestionDTO[] }[];
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
 * One question's rating control plus its optional review textarea -- the same
 * composite renders in the core form, the anonymous thank-you screen's "Add more
 * detail" expander, and (via SignedInRateForm) the signed-in form, so review UX never
 * drifts between the three. Consent for written comments is collected once, at the
 * bottom of the enclosing form/section -- see the single consent checkbox rendered
 * above each surface's submit button -- not per question.
 */
function QuestionWithReview({
  question,
  value,
  onValueChange,
  na,
  onNaChange,
  reviewText,
  onReviewTextChange,
}: {
  question: PollQuestionDTO;
  value: number | null;
  onValueChange: (value: number | null) => void;
  na: boolean;
  onNaChange: (na: boolean) => void;
  reviewText: string;
  onReviewTextChange: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <QuestionInput question={question} value={value} onChange={onValueChange} na={na} onNaChange={onNaChange} />
      <div className="flex flex-col gap-1.5 pl-1">
        <Textarea
          placeholder="Want to say more? Your answer may be published publicly in this program's reviews after moderation. (optional)"
          value={reviewText}
          onChange={(e) => onReviewTextChange(e.target.value)}
          maxLength={1000}
          rows={2}
          className="text-sm"
        />
      </div>
    </div>
  );
}

/**
 * Renders the Core question list followed by each extra bucket (with its own group
 * heading) -- the single place "which questions render, in what order" lives, shared by
 * both SignedInRateForm and AnonymousRateForm so their question sets can never drift
 * apart.
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
    <>
      {questions.map((q) => (
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
      {extras.map(({ bucket, questions: bucketQuestions }) => (
        <div key={bucket.id} className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{bucket.name}</p>
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
    </>
  );
}

/**
 * The single, once-per-submission consent checkbox for written comments -- gates
 * `reviews` only, never the rating/N/A fields. Rendered directly above each surface's
 * submit button. `error` renders an inline message right at the checkbox (never at the
 * top of the form) when the respondent tried to submit non-empty comments without
 * checking it -- the submit is blocked, not the comment text discarded.
 */
function ReviewConsentCheckbox({
  checked,
  onChange,
  error,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 accent-accent"
        />
        <span>I understand my written comments may be published publicly on this program&rsquo;s page after moderation.</span>
      </label>
      {error && (
        <p className="pl-6 text-xs text-danger">Please check the box above to submit your written comments.</p>
      )}
    </div>
  );
}

/** One respondent's in-progress contact opt-in state, local to whichever form renders
 * ContactOptInBlock -- not persisted anywhere until a successful submit. */
type ContactOptInState = {
  consent: boolean;
  ageAttested: boolean;
  contactMethod: string;
  contactName: string;
};

const EMPTY_CONTACT_OPT_IN: ContactOptInState = {
  consent: false,
  ageAttested: false,
  contactMethod: "",
  contactName: "",
};

/** True only when every required field for a complete opt-in is present -- the single
 * predicate both the submit-time validation and the payload builder below use, so they
 * can never disagree about what counts as "opted in." */
function isContactOptInComplete(state: ContactOptInState): boolean {
  return state.consent && state.ageAttested && state.contactMethod.trim().length > 0 && state.contactName.trim().length > 0;
}

/**
 * Collected at the end of the rating flow, just above the submit button -- an opt-in to
 * being contacted by prospective participants, deliberately separate from the heavier
 * Reference/ContactRequest system elsewhere on the program page (never publicly
 * rendered; admin-visible only, see /admin/programs). Two SEPARATE checkboxes, not one
 * combined control: consent ("I'm open to being contacted") and an 18+
 * self-attestation are two distinct claims requiring two distinct affirmative acts. The
 * age checkbox and the two required fields only appear once consent is checked, so a
 * respondent who isn't interested never sees them -- but the fields, once revealed, are
 * validated at submit time (see the two forms' handleSubmit), not silently dropped.
 */
function ContactOptInBlock({
  state,
  onChange,
  error,
}: {
  state: ContactOptInState;
  onChange: (next: ContactOptInState) => void;
  error: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={state.consent}
          onChange={(e) => onChange({ ...state, consent: e.target.checked })}
          className="mt-0.5 accent-accent"
        />
        <span>I&rsquo;m open to being contacted by prospective participants about this program.</span>
      </label>
      {state.consent && (
        <div className="flex flex-col gap-2 pl-6">
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={state.ageAttested}
              onChange={(e) => onChange({ ...state, ageAttested: e.target.checked })}
              className="mt-0.5 accent-accent"
            />
            <span>I&rsquo;m 18 or older.</span>
          </label>
          <Input
            placeholder="Email or WhatsApp number"
            value={state.contactMethod}
            onChange={(e) => onChange({ ...state, contactMethod: e.target.value })}
          />
          <Input
            placeholder="Display name or initial, e.g. Yaakov B."
            value={state.contactName}
            onChange={(e) => onChange({ ...state, contactName: e.target.value })}
          />
          <p className="text-xs text-muted">Never shown publicly -- program admins only.</p>
        </div>
      )}
      {error && (
        <p className="pl-6 text-xs text-danger">
          Please confirm you&rsquo;re 18 or older and fill in a contact method and name -- or uncheck the box above to skip this.
        </p>
      )}
    </div>
  );
}

/** Builds the {questionId, value}[] / {questionId, text, consent}[] / string[] payloads
 * from per-question state -- a skipped question (value null, not N/A'd) is simply
 * absent from `answers`; an N/A'd question is excluded from `answers` (defensively,
 * even though checking N/A already clears `values[q.id]` via QuestionInput's
 * toggleNa) and instead listed in `naQuestionIds`. Non-empty comment text is detected
 * independent of consent (`hasComments`, used to decide whether the single consent
 * checkbox needs to be checked at all) -- `reviews` itself only carries those comments
 * when `consentGiven` is true, so an unconsented comment is never sent, never flagged
 * as `consent: false`. */
function buildSubmission(
  questions: PollQuestionDTO[],
  values: Record<string, number | null>,
  naValues: Record<string, boolean>,
  reviewTexts: Record<string, string>,
  consentGiven: boolean
) {
  const answers = questions
    .filter((q) => values[q.id] !== null && !naValues[q.id])
    .map((q) => ({ questionId: q.id, value: values[q.id] as number }));
  const naQuestionIds = questions.filter((q) => naValues[q.id]).map((q) => q.id);
  const comments = questions
    .filter((q) => reviewTexts[q.id]?.trim())
    .map((q) => ({ questionId: q.id, text: reviewTexts[q.id].trim() }));
  const hasComments = comments.length > 0;
  const reviews = consentGiven ? comments.map((c) => ({ ...c, consent: true as const })) : [];
  return { answers, naQuestionIds, reviews, hasComments };
}

function SignedInRateForm({
  programId,
  questions,
  extras,
  existingAnswers,
  existingNaQuestionIds,
}: Extract<RateFormProps, { mode: "signed-in" }>) {
  const router = useRouter();
  const isUpdate = existingAnswers !== undefined;
  // Both the signed-in and anonymous forms show the FULL resolved question set inline
  // (Core plus every extra bucket auto-attached by a filter rule or manually) -- see
  // QuestionSections, shared by both. allQuestions backs state init and submission.
  const allQuestions = [...questions, ...extras.flatMap((e) => e.questions)];
  const [values, setValues] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(allQuestions.map((q) => [q.id, existingAnswers?.[q.id] ?? null]))
  );
  const [naFlags, setNaFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allQuestions.map((q) => [q.id, existingNaQuestionIds?.includes(q.id) ?? false]))
  );
  const [reviewTexts, setReviewTexts] = useState<Record<string, string>>({});
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [contactOptIn, setContactOptIn] = useState<ContactOptInState>(EMPTY_CONTACT_OPT_IN);
  const [contactOptInError, setContactOptInError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    const { answers, naQuestionIds, reviews, hasComments } = buildSubmission(
      allQuestions,
      values,
      naFlags,
      reviewTexts,
      consentGiven
    );
    if (hasComments && !consentGiven) {
      setConsentError(true);
      return;
    }
    if (contactOptIn.consent && !isContactOptInComplete(contactOptIn)) {
      setContactOptInError(true);
      return;
    }
    if (answers.length === 0 && reviews.length === 0) {
      setError(EMPTY_SUBMISSION_MESSAGE);
      return;
    }

    setConsentError(false);
    setContactOptInError(false);
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/polls/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          answers,
          naQuestionIds,
          reviews,
          contactOptIn: isContactOptInComplete(contactOptIn)
            ? {
                consent: true,
                ageAttested: true,
                contactMethod: contactOptIn.contactMethod.trim(),
                contactName: contactOptIn.contactName.trim(),
              }
            : undefined,
        }),
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
      <QuestionSections
        questions={questions}
        extras={extras}
        values={values}
        naFlags={naFlags}
        reviewTexts={reviewTexts}
        onValueChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))}
        onNaChange={(id, na) => setNaFlags((prev) => ({ ...prev, [id]: na }))}
        onReviewTextChange={(id, text) => setReviewTexts((prev) => ({ ...prev, [id]: text }))}
      />
      <ReviewConsentCheckbox
        checked={consentGiven}
        onChange={(checked) => {
          setConsentGiven(checked);
          if (checked) setConsentError(false);
        }}
        error={consentError}
      />
      <ContactOptInBlock
        state={contactOptIn}
        onChange={(next) => {
          setContactOptIn(next);
          if (isContactOptInComplete(next) || !next.consent) setContactOptInError(false);
        }}
        error={contactOptInError}
      />
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
  email: string;
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
  // Same full resolved question set (Core plus every extra bucket) as the signed-in
  // form -- see QuestionSections, shared by both -- so an anonymous link visitor sees
  // an identical questionnaire to a signed-in user.
  const allQuestions = [...questions, ...extras.flatMap((e) => e.questions)];
  // Every question starts unanswered (null), same as the signed-in form -- this
  // supersedes the earlier "pre-position at 3" design, which made an untouched
  // question indistinguishable from a real answer of 3. The very first render (both
  // on the server and React's initial client hydration pass) always starts from this
  // default -- a saved draft, if any, arrives via useSavedDraft one tick later and is
  // applied below during render (React's "adjusting state when a store value changes"
  // pattern), not inside an effect, so there's no hydration mismatch and no
  // setState-in-effect cascade.
  const [values, setValues] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(allQuestions.map((q) => [q.id, null]))
  );
  const [naFlags, setNaFlags] = useState<Record<string, boolean>>({});
  const [reviewTexts, setReviewTexts] = useState<Record<string, string>>({});
  // Consent is deliberately NOT persisted to the draft (see saveDraft's payload below)
  // -- restoring a draft always starts the consent checkbox unchecked, even if it was
  // checked before the page reloaded. Review *text* is preserved so nothing is lost,
  // but re-affirming consent is a fresh, deliberate act every time. N/A marks *are*
  // persisted -- unlike consent, checking N/A isn't a legal affirmation, just a data
  // choice, so there's no reason to make the respondent re-mark it after a reload.
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [yearAttended, setYearAttended] = useState<number | null>(null);
  // Optional, upfront -- never required, never gates counting (see
  // lib/pollShared.ts's anonymousSubmitSchema). Persisted to the draft like any other
  // form field (unlike consent, entering an email isn't a legal affirmation).
  const [email, setEmail] = useState("");
  // Also not persisted to the draft, same reasoning as consentGiven above -- consent and
  // the 18+ attestation are fresh affirmative acts every time, not something a reload
  // should silently restore as already-given.
  const [contactOptIn, setContactOptIn] = useState<ContactOptInState>(EMPTY_CONTACT_OPT_IN);
  const [contactOptInError, setContactOptInError] = useState(false);
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
    if (savedDraft.email) setEmail(savedDraft.email);
  }

  useEffect(() => {
    if (responseId) return; // already submitted -- stop autosaving over a cleared draft
    saveDraft(programSlug, { values, naFlags, reviewTexts, yearAttended, email });
  }, [programSlug, values, naFlags, reviewTexts, yearAttended, email, responseId]);

  async function handleSubmit() {
    const { answers, naQuestionIds, reviews, hasComments } = buildSubmission(
      allQuestions,
      values,
      naFlags,
      reviewTexts,
      consentGiven
    );
    if (hasComments && !consentGiven) {
      setConsentError(true);
      return;
    }
    if (contactOptIn.consent && !isContactOptInComplete(contactOptIn)) {
      setContactOptInError(true);
      return;
    }
    if (answers.length === 0 && reviews.length === 0) {
      setError(EMPTY_SUBMISSION_MESSAGE);
      return;
    }

    setConsentError(false);
    setContactOptInError(false);
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
          email: email.trim() || undefined,
          contactOptIn: isContactOptInComplete(contactOptIn)
            ? {
                consent: true,
                ageAttested: true,
                contactMethod: contactOptIn.contactMethod.trim(),
                contactName: contactOptIn.contactName.trim(),
              }
            : undefined,
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
    return <ThankYouScreen programName={programName} />;
  }

  return (
    <div data-poll-mode="anonymous" className="flex flex-col gap-6">
      {error && <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}
      <ReviewConsentContext />
      <QuestionSections
        questions={questions}
        extras={extras}
        values={values}
        naFlags={naFlags}
        reviewTexts={reviewTexts}
        onValueChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))}
        onNaChange={(id, na) => setNaFlags((prev) => ({ ...prev, [id]: na }))}
        onReviewTextChange={(id, text) => setReviewTexts((prev) => ({ ...prev, [id]: text }))}
      />
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
      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Email (optional)</span>
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <span className="text-xs text-muted">
          Only if you&rsquo;re open to being contacted -- never required, and your rating counts either way.
        </span>
      </label>
      <ReviewConsentCheckbox
        checked={consentGiven}
        onChange={(checked) => {
          setConsentGiven(checked);
          if (checked) setConsentError(false);
        }}
        error={consentError}
      />
      <ContactOptInBlock
        state={contactOptIn}
        onChange={(next) => {
          setContactOptIn(next);
          if (isContactOptInComplete(next) || !next.consent) setContactOptInError(false);
        }}
        error={contactOptInError}
      />
      <Button type="button" disabled={submitting} onClick={handleSubmit} className="self-start">
        {submitting ? "Submitting..." : "Submit rating"}
      </Button>
    </div>
  );
}

/**
 * The anonymous form now presents the full resolved question set (core + extras)
 * upfront, same as the signed-in form, so there's no longer a post-submit "add more
 * detail" step here -- just the confirmation.
 */
function ThankYouScreen({ programName }: { programName: string }) {
  return (
    <div
      data-poll-mode="anonymous"
      className="rounded-xl border border-success/30 bg-success-bg p-6 text-center text-sm font-medium text-success"
    >
      Thanks -- your rating of {programName} has been recorded!
    </div>
  );
}
