"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";

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
      <p className="rounded-lg bg-info-bg px-3 py-2 text-sm text-info">
        Thanks! Your reference listing is awaiting moderator approval.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <Input
        required
        placeholder="When did you attend? e.g. 2021-2022, or Summer 2019"
        value={attendedText}
        onChange={(e) => setAttendedText(e.target.value)}
      />
      <Textarea
        rows={2}
        placeholder="Optional: what are you happy to talk about? (e.g. the medical track, dorm life, the application process)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button type="submit" size="sm" disabled={submitting} className="w-fit">
        {submitting ? "Submitting..." : "Volunteer as a reference"}
      </Button>
    </form>
  );
}
