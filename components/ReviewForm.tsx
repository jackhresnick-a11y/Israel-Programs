"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export default function ReviewForm({ programId }: { programId: string }) {
  const router = useRouter();
  const { toast } = useToast();
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
      toast("Your review has been submitted into the database");
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
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-foreground">Your rating</span>
        <Select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="py-1"
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)} ({n})
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        required
        rows={3}
        placeholder="Share your experience with this program..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button type="submit" size="sm" disabled={submitting} className="w-fit">
        {submitting ? "Posting..." : "Post review"}
      </Button>
    </form>
  );
}
