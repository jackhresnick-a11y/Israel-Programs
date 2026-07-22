"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Reference = {
  id: string;
  displayName: string;
  attendedText: string;
  note: string | null;
};

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

      {/* TEMPORARILY DISABLED -- see the matching guard in
          app/api/references/[id]/contact-requests/route.ts for why. Remove this note
          and restore the request-to-connect flow once feature/alumni-references-double-optin
          ships and replaces it. */}
      <p className="mt-2 text-xs text-muted">Contact requests are temporarily unavailable.</p>
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
