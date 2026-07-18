"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import { FAQ_CONSENT_CONTEXT, FAQ_CONSENT_LABEL } from "@/lib/programFaqShared";

/**
 * Collapsed button -> textarea + consent checkbox + honeypot, same expand-to-form
 * pattern this codebase uses elsewhere (RateForm's "Add more detail" expander). The
 * question is never sent unless the consent box is checked -- client-side gate #1 of
 * the three-layer enforcement (zod `literal(true)`, DB CHECK are the other two).
 */
export default function AskQuestionForm({ programId }: { programId: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="rounded-xl border border-success/30 bg-success-bg p-4 text-center text-sm font-medium text-success">
        Thanks — your question has been submitted for review.
      </div>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="self-start">
        Ask a question
      </Button>
    );
  }

  async function handleSubmit() {
    if (!consent) {
      setError("Please check the consent box before submitting.");
      return;
    }
    if (!question.trim()) {
      setError("Enter a question first.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/faq-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), consent: true, website }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to submit question");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">{FAQ_CONSENT_CONTEXT}</p>
      <Textarea
        placeholder="What would you like to know?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        maxLength={500}
        rows={3}
        className="text-sm"
      />
      <label className="flex items-start gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 accent-accent"
        />
        <span>{FAQ_CONSENT_LABEL}</span>
      </label>
      {/* Honeypot -- hidden from real users, off-screen rather than display:none so it
          still trips up bots that skip hidden fields. Same markup as ContactForm.tsx. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="faq-website">Website</label>
        <input
          id="faq-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={submitting} onClick={handleSubmit} className="self-start">
          {submitting ? "Submitting..." : "Submit question"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} className="self-start">
          Cancel
        </Button>
      </div>
    </div>
  );
}
