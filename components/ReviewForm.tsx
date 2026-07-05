"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewForm({ programId }: { programId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to submit review");
      }
      setText("");
      setRating(5);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">Your rating</span>
        <select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="rounded-lg border border-blue-100 bg-transparent px-2 py-1 dark:border-blue-950"
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)} ({n})
            </option>
          ))}
        </select>
      </div>
      <textarea
        required
        rows={3}
        placeholder="Share your experience with this program..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="rounded-lg border border-blue-100 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-blue-950 dark:focus:border-amber-500"
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
      >
        {submitting ? "Posting..." : "Post review"}
      </button>
    </form>
  );
}
