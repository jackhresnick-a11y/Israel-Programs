"use client";

import Link from "next/link";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

type FolderProgram = {
  id: string;
  name: string;
  slug: string;
  location: string | null;
};

type FolderItemDTO = { id: string; program: FolderProgram | null; unavailable: boolean };

/** Owner's own view: label-don't-hide. Unavailable items (a program that was
 *  unpublished, or a tombstone from a hard delete) stay visible with a
 *  status badge rather than silently vanishing, so the owner can find and
 *  clear them -- see lib/folders.ts's clearUnavailableItems. */
export default function FolderItemsList({
  folderId,
  initialItems,
}: {
  folderId: string;
  initialItems: FolderItemDTO[];
}) {
  const [items, setItems] = useState(initialItems);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const { toast } = useToast();

  const unavailableCount = items.filter((item) => item.unavailable).length;

  async function handleRemove(item: FolderItemDTO) {
    if (!item.program) return; // tombstones only clear via "Clear unavailable items"
    setRemovingId(item.id);
    try {
      const res = await fetch(`/api/folders/${folderId}/items/${encodeURIComponent(item.program.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast("Couldn't remove that program — try again.", "info");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } finally {
      setRemovingId(null);
    }
  }

  async function handleClearUnavailable() {
    setClearing(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/clear-unavailable`, { method: "POST" });
      if (!res.ok) {
        toast("Couldn't clear unavailable items — try again.", "info");
        return;
      }
      setItems((prev) => prev.filter((item) => !item.unavailable));
    } finally {
      setClearing(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted">No programs saved to this folder yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {unavailableCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-bg px-4 py-2 text-sm text-warning">
          <span>
            {unavailableCount} {unavailableCount === 1 ? "program is" : "programs are"} no longer available.
          </span>
          <button
            type="button"
            onClick={handleClearUnavailable}
            disabled={clearing}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            {clearing ? "Clearing…" : "Clear unavailable items"}
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <Card key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
            {item.program ? (
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
                  <span className="font-serif text-base font-semibold text-muted">
                    {item.program.name.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0">
                  {item.unavailable ? (
                    <span className="font-medium text-foreground">{item.program.name}</span>
                  ) : (
                    <Link
                      href={`/programs/${item.program.slug}`}
                      className="font-medium text-foreground hover:text-accent hover:underline"
                    >
                      {item.program.name}
                    </Link>
                  )}
                  {item.unavailable ? (
                    <div className="mt-0.5">
                      <Badge tone="warning">No longer listed</Badge>
                    </div>
                  ) : (
                    item.program.location && <p className="text-xs text-muted">{item.program.location}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted">
                  ?
                </div>
                <div>
                  <span className="font-medium text-foreground">Removed program</span>
                  <div className="mt-0.5">
                    <Badge tone="warning">No longer available</Badge>
                  </div>
                </div>
              </div>
            )}
            {item.program && (
              <button
                type="button"
                onClick={() => handleRemove(item)}
                disabled={removingId === item.id}
                className="shrink-0 text-xs text-muted underline underline-offset-2 hover:text-danger"
              >
                Remove
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
