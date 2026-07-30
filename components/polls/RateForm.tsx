"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import QuestionInput from "@/components/polls/QuestionInput";
import PartnerCta from "@/components/PartnerCta";
import { pollDraftKey, yearAttendedOptions, POLL_REFERENCE_CONSENT_LABEL, type PollQuestionDTO, type PollBucketDTO } from "@/lib/pollShared";
import type { PartnerLinkSlot } from "@/lib/partnerLinksConfig";

type RateFormProps =
  | {
      mode: "signed-in";
      programId: string;
      questions: PollQuestionDTO[];
      extras: { bucket: PollBucketDTO; questions: PollQuestionDTO[] }[];
      existingAnswers?: Record<string, number>;
      existingNaQuestionIds?: string[];
      /** Slot 3, resolved server-side (fail-closed to null). Rendered ONLY in the
       * post-transition confirmation state -- never before. */
      postPollCta: PartnerLinkSlot | null;
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
       * post-transition ThankYouScreen -- never before. */
      postPollCta: PartnerLinkSlot | null;
    };

export default function RateForm(props: RateFormProps) {
  if (props.mode === "signed-in") return <SignedInRateForm {...props} />;
  return <AnonymousRateForm {...props} />;
}

const DEBOUNCE_MS = 600;

/** One debounced save per key (a questionId, or the fixed "details" key for
 * reviews/contact fields) -- a fresh change to the same key cancels and restarts its own
 * timer, never affecting any other key's pending save. Timers are cleared on unmount so
 * a component going away can't fire a save into a stale closure. */
function useKeyedDebounce(delayMs: number) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      for (const t of timers.current.values()) clearTimeout(t);
    },
    []
  );
  return function schedule(key: string, fn: () => void) {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        fn();
      }, delayMs)
    );
  };
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
 * One question's rating control plus its optional review textarea -- shared by the
 * signed-in and anonymous forms so review UX never drifts between them. Consent for
 * written comments is collected once, at the bottom of the form -- see the single
 * consent checkbox rendered above the questions -- not per question.
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
      <div className="flex flex-col gap-2 pl-1">
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

/** One respondent's in-progress contact opt-in state -- autosaved (debounced) whenever
 * it's complete; held back client-side otherwise. */
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
 * predicate deciding whether this autosaves at all. */
function isContactOptInComplete(state: ContactOptInState): boolean {
  return state.consent && state.ageAttested && state.contactMethod.trim().length > 0 && state.contactName.trim().length > 0;
}

/**
 * An opt-in to being contacted by prospective participants, deliberately separate from
 * the heavier Reference/ContactRequest system elsewhere on the program page (never
 * publicly rendered; admin-visible only, see /admin/programs). Two SEPARATE checkboxes,
 * not one combined control: consent and an 18+ self-attestation are two distinct claims
 * requiring two distinct affirmative acts. Autosaves (debounced) once complete; a
 * partially-filled opt-in just isn't sent yet, with a non-blocking hint below.
 */
function ContactOptInBlock({
  state,
  onChange,
  hint,
}: {
  state: ContactOptInState;
  onChange: (next: ContactOptInState) => void;
  hint: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded border border-border p-3">
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={state.consent}
          onChange={(e) => onChange({ ...state, consent: e.target.checked })}
          className="mt-1 accent-accent"
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
              className="mt-1 accent-accent"
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
      {hint && (
        <p className="pl-6 text-xs text-muted">
          Confirm you&rsquo;re 18 or older and fill in a contact method and name to save this -- or uncheck the box above to skip it.
        </p>
      )}
    </div>
  );
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
function clearResumeId(programSlug: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(pollDraftKey(programSlug));
  } catch {
    // See saveResumeId.
  }
}

type OpenResult = { responseId: string; status: string; answers: Record<string, number>; naQuestionIds: string[] };

function SignedInRateForm({
  programId,
  questions,
  extras,
  existingAnswers,
  existingNaQuestionIds,
  postPollCta,
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
  const [contactOptIn, setContactOptIn] = useState<ContactOptInState>(EMPTY_CONTACT_OPT_IN);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const statusRef = useRef<string>("INCOMPLETE");
  const schedule = useKeyedDebounce(DEBOUNCE_MS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/polls/responses/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId }),
    })
      .then((res) => res.json())
      .then((body: OpenResult) => {
        if (cancelled) return;
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
        // Poll-open failing just means autosave can't start yet -- the form still
        // renders; the next answer change retries implicitly since responseId stays
        // null and saveAnswer below no-ops until it's set.
      });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  function applyStatus(nextStatus: string) {
    if (statusRef.current === "INCOMPLETE" && nextStatus !== "INCOMPLETE") {
      setJustCompleted(true);
    }
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

  async function saveDetailsToServer(overrides: { reviewTexts?: Record<string, string>; consentGiven?: boolean; contactOptIn?: ContactOptInState } = {}) {
    if (!responseId) return;
    const effectiveReviewTexts = overrides.reviewTexts ?? reviewTexts;
    const effectiveConsent = overrides.consentGiven ?? consentGiven;
    const effectiveContactOptIn = overrides.contactOptIn ?? contactOptIn;
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
          contactOptIn: isContactOptInComplete(effectiveContactOptIn)
            ? {
                consent: true,
                ageAttested: true,
                contactMethod: effectiveContactOptIn.contactMethod.trim(),
                contactName: effectiveContactOptIn.contactName.trim(),
              }
            : undefined,
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
  function handleContactOptInChange(next: ContactOptInState) {
    setContactOptIn(next);
    schedule("details", () => saveDetailsToServer({ contactOptIn: next }));
  }

  if (justCompleted) {
    return (
      <div data-poll-mode="signed-in" className="flex flex-col gap-6">
        <div className="rounded border border-success/30 bg-success-bg p-6 text-center text-sm font-medium text-success">
          {isUpdate ? "Your rating has been updated." : "Thanks for rating this program!"}
        </div>
        <PartnerCta slot={postPollCta} />
      </div>
    );
  }

  return (
    <div data-poll-mode="signed-in" className="flex flex-col gap-6">
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
      <ContactOptInBlock
        state={contactOptIn}
        onChange={handleContactOptInChange}
        hint={contactOptIn.consent && !isContactOptInComplete(contactOptIn)}
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
  const statusRef = useRef<string>("INCOMPLETE");
  const schedule = useKeyedDebounce(DEBOUNCE_MS);

  useEffect(() => {
    let cancelled = false;
    const resumeId = loadResumeId(programSlug) ?? undefined;
    fetch("/api/polls/responses/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, ref: referrerToken, resumeId }),
    })
      .then((res) => res.json())
      .then((body: OpenResult) => {
        if (cancelled) return;
        setResponseId(body.responseId);
        statusRef.current = body.status;
        saveResumeId(programSlug, body.responseId);
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
        // See SignedInRateForm's identical catch -- the form still renders; autosave
        // just can't start until responseId resolves.
      });
    return () => {
      cancelled = true;
    };
  }, [programId, programSlug, referrerToken]);

  function applyStatus(nextStatus: string) {
    if (statusRef.current === "INCOMPLETE" && nextStatus !== "INCOMPLETE") {
      setJustCompleted(true);
      clearResumeId(programSlug);
    }
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
    return <ThankYouScreen programName={programName} postPollCta={postPollCta} />;
  }

  return (
    <div data-poll-mode="anonymous" className="flex flex-col gap-6">
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
    </div>
  );
}

/**
 * The anonymous form presents the full resolved question set (core + extras) upfront,
 * same as the signed-in form -- there's no post-completion "add more detail" step here,
 * just the confirmation, reached only once autosave crosses the majority bar.
 */
function ThankYouScreen({ programName, postPollCta }: { programName: string; postPollCta: PartnerLinkSlot | null }) {
  return (
    <div data-poll-mode="anonymous" className="flex flex-col gap-6">
      <div className="rounded border border-success/30 bg-success-bg p-6 text-center text-sm font-medium text-success">
        Thanks -- your rating of {programName} has been recorded!
      </div>
      <PartnerCta slot={postPollCta} />
    </div>
  );
}
