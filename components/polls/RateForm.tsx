"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import QuestionInput from "@/components/polls/QuestionInput";
import type { PollQuestionDTO } from "@/lib/pollShared";

export default function RateForm({
  // Only "signed-in" exists so far -- kept as a discriminant now so the anonymous
  // link-path mode (Step 5) can extend this component without changing its call sites.
  mode,
  programId,
  questions,
  existingAnswers,
}: {
  mode: "signed-in";
  programId: string;
  questions: PollQuestionDTO[];
  existingAnswers?: Record<string, number>;
}) {
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
        data-poll-mode={mode}
        className="rounded-xl border border-success/30 bg-success-bg p-6 text-center text-sm font-medium text-success"
      >
        {isUpdate ? "Your rating has been updated." : "Thanks for rating this program!"}
      </div>
    );
  }

  return (
    <div data-poll-mode={mode} className="flex flex-col gap-6">
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
