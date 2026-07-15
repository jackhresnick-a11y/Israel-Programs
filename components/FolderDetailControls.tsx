"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export default function FolderDetailControls({
  folderId,
  initialName,
}: {
  folderId: string;
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      setDraft(name);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(body.error ?? "Couldn't rename this folder.", "info");
        setDraft(name);
        return;
      }
      setName(trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/folders/${folderId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/saved");
      router.refresh();
    } else {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {editing ? (
        <form onSubmit={handleRename} className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={80}
            autoFocus
            className="rounded-lg border border-border bg-background px-3 py-1.5 font-serif text-xl font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <Button type="submit" size="sm" disabled={saving}>
            Save
          </Button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(name);
            }}
            className="text-sm text-muted hover:text-foreground"
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {name}
          </h1>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-muted underline underline-offset-2 hover:text-accent"
          >
            Rename
          </button>
        </>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="ml-auto shrink-0 text-xs text-danger underline underline-offset-2 hover:opacity-80"
      >
        {deleting ? "Deleting…" : "Delete folder"}
      </button>
    </div>
  );
}
