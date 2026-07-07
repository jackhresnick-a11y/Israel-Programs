"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";

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
        <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Mission statement</span>
        <Textarea
          required
          rows={14}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
