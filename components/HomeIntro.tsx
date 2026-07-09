"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/Button";

export default function HomeIntro({
  text,
  isAdmin,
}: {
  text: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setValue(text);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setValue(text);
    setError(null);
    setEditing(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/home-intro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Failed to save");
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-2 text-left">
        {error && (
          <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>
        )}
        <Textarea
          required
          rows={4}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="text-sm"
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={cancel} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col items-center gap-2 sm:items-start">
      <p className="text-foreground/70">{text}</p>
      {isAdmin && (
        <button
          type="button"
          onClick={startEditing}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Edit
        </button>
      )}
    </div>
  );
}
