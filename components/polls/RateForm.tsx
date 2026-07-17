"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Card from "@/components/ui/Card";
import QuestionInput from "@/components/polls/QuestionInput";
import { pollDraftKey, yearAttendedOptions, type PollQuestionDTO, type PollBucketDTO } from "@/lib/pollShared";

type RateFormProps =
  | {
      mode: "signed-in";
      programId: string;
      questions: PollQuestionDTO[];
      existingAnswers?: Record<string, number>;
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

function SignedInRateForm({
  programId,
  questions,
  existingAnswers,
}: Extract<RateFormProps, { mode: "signed-in" }>) {
  const router = useRouter();
  const isUpdate = existingAnswers !== undefined;
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, existingAnswers?.[q.id] ?? 3]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/polls/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          answers: questions.map((q) => ({ questionId: q.id, value: values[q.id] })),
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
      {questions.map((q) => (
        <QuestionInput
          key={q.id}
          question={q}
          value={values[q.id]}
          onChange={(v) => setValues((prev) => ({ ...prev, [q.id]: v }))}
        />
      ))}
      <Button type="button" disabled={submitting} onClick={handleSubmit} className="self-start">
        {submitting ? "Submitting..." : isUpdate ? "Update rating" : "Submit rating"}
      </Button>
    </div>
  );
}

type Draft = { values: Record<string, number>; yearAttended: number | null };

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
  // All inputs pre-positioned at 3 (midpoint), never empty. The very first render (both
  // on the server and React's initial client hydration pass) always starts from this
  // default -- a saved draft, if any, arrives via useSavedDraft one tick later and is
  // applied below during render (React's "adjusting state when a store value changes"
  // pattern), not inside an effect, so there's no hydration mismatch and no
  // setState-in-effect cascade.
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, 3]))
  );
  const [yearAttended, setYearAttended] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);

  const savedDraft = useSavedDraft(programSlug);
  const [appliedDraft, setAppliedDraft] = useState<Draft | null>(null);
  if (savedDraft !== null && savedDraft !== appliedDraft) {
    setAppliedDraft(savedDraft);
    setValues((prev) => ({ ...prev, ...savedDraft.values }));
    if (savedDraft.yearAttended !== null && savedDraft.yearAttended !== undefined) {
      setYearAttended(savedDraft.yearAttended);
    }
  }

  useEffect(() => {
    if (responseId) return; // already submitted -- stop autosaving over a cleared draft
    saveDraft(programSlug, { values, yearAttended });
  }, [programSlug, values, yearAttended, responseId]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/polls/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          ref: referrerToken,
          answers: questions.map((q) => ({ questionId: q.id, value: values[q.id] })),
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
      {questions.map((q) => (
        <QuestionInput
          key={q.id}
          question={q}
          value={values[q.id]}
          onChange={(v) => setValues((prev) => ({ ...prev, [q.id]: v }))}
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

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailValues, setDetailValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(extras.flatMap((e) => e.questions).map((q) => [q.id, 3]))
  );
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
    setDetailStatus("saving");
    try {
      const answers = extras
        .flatMap((e) => e.questions)
        .map((q) => ({ questionId: q.id, value: detailValues[q.id] }));
      const res = await fetch(`/api/polls/responses/${responseId}/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
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
                  {extras.map(({ bucket, questions }) => (
                    <div key={bucket.id} className="flex flex-col gap-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{bucket.name}</p>
                      {questions.map((q) => (
                        <QuestionInput
                          key={q.id}
                          question={q}
                          value={detailValues[q.id]}
                          onChange={(v) => setDetailValues((prev) => ({ ...prev, [q.id]: v }))}
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
