"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignInButton, Show } from "@clerk/nextjs";

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
      <p className="mt-2 text-xs text-blue-700 dark:text-blue-400">
        Request sent. They&apos;ll reach out to the email on your account if they
        reply.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <textarea
        required
        rows={2}
        placeholder="What would you like to ask them?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="rounded-lg border border-blue-100 bg-transparent px-3 py-2 text-xs outline-none focus:border-primary dark:border-blue-950 dark:focus:border-amber-500"
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
      >
        {submitting ? "Sending..." : "Send request"}
      </button>
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
    <li className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{reference.displayName}</span>
          <span className="text-black/50 dark:text-white/50">
            {" "}
            · attended {reference.attendedText}
          </span>
        </div>
        {isModerator && (
          <button
            onClick={() => onDelete(reference.id)}
            disabled={deleting}
            className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>
      {reference.note && (
        <p className="mt-2 text-sm text-black/70 dark:text-white/70">
          {reference.note}
        </p>
      )}

      <Show
        when="signed-in"
        fallback={
          <SignInButton mode="modal">
            <button className="mt-2 text-xs text-amber-700 hover:underline dark:text-amber-400">
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
            className="mt-2 text-xs text-amber-700 hover:underline dark:text-amber-400"
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
      <p className="text-sm text-black/50 dark:text-white/50">
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
