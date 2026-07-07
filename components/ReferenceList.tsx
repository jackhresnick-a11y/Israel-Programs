"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignInButton, Show } from "@clerk/nextjs";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";

type Reference = {
  id: string;
  displayName: string;
  attendedText: string;
  note: string | null;
};

function ContactRequestForm({ referenceId }: { referenceId: string }) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/references/${referenceId}/contact-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to send request");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <p className="mt-2 text-xs text-info">
        Request sent. They&apos;ll reach out to the email on your account if they
        reply.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      {error && <p className="text-xs text-danger">{error}</p>}
      <Textarea
        required
        rows={2}
        placeholder="What would you like to ask them?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="text-xs"
      />
      <Button type="submit" size="sm" disabled={submitting} className="w-fit">
        {submitting ? "Sending..." : "Send request"}
      </Button>
    </form>
  );
}

function ReferenceRow({
  reference,
  isModerator,
  onDelete,
  deleting,
}: {
  reference: Reference;
  isModerator: boolean;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const [requesting, setRequesting] = useState(false);

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium text-foreground">{reference.displayName}</span>
          <span className="text-muted">
            {" "}
            · attended {reference.attendedText}
          </span>
        </div>
        {isModerator && (
          <button
            onClick={() => onDelete(reference.id)}
            disabled={deleting}
            className="text-xs text-danger hover:underline disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>
      {reference.note && (
        <p className="mt-2 text-sm text-foreground/70">
          {reference.note}
        </p>
      )}

      <Show
        when="signed-in"
        fallback={
          <SignInButton mode="modal">
            <button className="mt-2 text-xs text-accent-hover hover:underline dark:text-accent">
              Sign in to request contact
            </button>
          </SignInButton>
        }
      >
        {requesting ? (
          <ContactRequestForm referenceId={reference.id} />
        ) : (
          <button
            onClick={() => setRequesting(true)}
            className="mt-2 text-xs text-accent-hover hover:underline dark:text-accent"
          >
            Request to connect
          </button>
        )}
      </Show>
    </li>
  );
}

export default function ReferenceList({
  references,
  isModerator,
}: {
  references: Reference[];
  isModerator: boolean;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this reference listing?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/references/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) router.refresh();
  }

  if (references.length === 0) {
    return (
      <p className="text-sm text-muted">
        No alumni references yet. Be the first to volunteer.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {references.map((reference) => (
        <ReferenceRow
          key={reference.id}
          reference={reference}
          isModerator={isModerator}
          onDelete={handleDelete}
          deleting={deletingId === reference.id}
        />
      ))}
    </ul>
  );
}
