"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export default function ReferenceForm({ programId }: { programId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [attendedText, setAttendedText] = useState("");
  const [note, setNote] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setError("Please check the consent box before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendedText, note, whatsappNumber, consent: true, website }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to submit");
      }
      setAttendedText("");
      setNote("");
      setWhatsappNumber("");
      setConsent(false);
      toast("Your request to be a reference for this program has been sent");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
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
      <div className="flex flex-col gap-1">
        <Input
          placeholder="Optional: WhatsApp number, e.g. +972 50 123 4567"
          value={whatsappNumber}
          onChange={(e) => setWhatsappNumber(e.target.value)}
        />
        <p className="text-xs text-muted">Never shown publicly — admins only.</p>
      </div>
      <label className="flex items-start gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 accent-accent"
        />
        <span>
          I consent to being listed publicly (display name + the note above) and to
          receiving contact requests from prospective students about this program. My
          email is never shown publicly.
        </span>
      </label>
      {/* Honeypot -- hidden from real users, off-screen rather than display:none so it
          still trips up bots that skip hidden fields. Same markup as AskQuestionForm.tsx. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="reference-website">Website</label>
        <input
          id="reference-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <Button type="submit" size="sm" disabled={submitting} className="w-fit">
        {submitting ? "Submitting..." : "Volunteer as a reference"}
      </Button>
    </form>
  );
}
