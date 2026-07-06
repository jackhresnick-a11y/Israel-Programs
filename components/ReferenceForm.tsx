"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReferenceForm({ programId }: { programId: string }) {
  const router = useRouter();
  const [attendedText, setAttendedText] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendedText, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to submit");
      }
      setAttendedText("");
      setNote("");
      setSubmitted(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <p className="rounded-lg bg-blue-500/10 px-3 py-2 text-sm text-blue-700 dark:text-blue-400">
        Thanks! Your reference listing is awaiting moderator approval.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <input
        required
        placeholder="When did you attend? e.g. 2021-2022, or Summer 2019"
        value={attendedText}
        onChange={(e) => setAttendedText(e.target.value)}
        className="rounded-lg border border-blue-100 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-blue-950 dark:focus:border-amber-500"
      />
      <textarea
        rows={2}
        placeholder="Optional: what are you happy to talk about? (e.g. the medical track, dorm life, the application process)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="rounded-lg border border-blue-100 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-blue-950 dark:focus:border-amber-500"
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Volunteer as a reference"}
      </button>
    </form>
  );
}
