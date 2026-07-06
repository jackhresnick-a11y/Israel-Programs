"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClass =
  "rounded-lg border border-blue-100 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-blue-950 dark:focus:border-amber-500";

export default function MissionForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [body, setBody] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/mission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Failed to save");
      }
      router.push("/mission");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Mission statement</span>
        <textarea
          required
          rows={14}
          className={inputClass}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
      >
        {submitting ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
