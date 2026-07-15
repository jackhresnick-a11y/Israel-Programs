"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useClerk } from "@clerk/nextjs";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

type FolderSummary = { id: string; name: string; isDefault: boolean; isShared: boolean; itemCount: number };

/** Bookmark icon-button + folder picker for a program card. First tap saves
 *  to the user's lazily-created default folder in one action; a second tap
 *  (now that it's saved) opens the picker to choose other folders or create
 *  a new one. All writes are pessimistic -- nothing here optimistically
 *  flips UI state ahead of a 2xx response. */
export default function BookmarkButton({ programId, name }: { programId: string; name: string }) {
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [folders, setFolders] = useState<FolderSummary[] | null>(null);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [rowPending, setRowPending] = useState<Set<string>>(new Set());
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const clerk = useClerk();

  async function handleFirstSave() {
    setPending(true);
    try {
      const res = await fetch("/api/folders/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });

      if (res.status === 401) {
        toast("Sign in to save programs", "info", { label: "Sign in", onClick: () => clerk.openSignIn() });
        return;
      }
      if (!res.ok) {
        toast("Couldn't save this program — try again.", "info");
        return;
      }

      const data = (await res.json()) as { folderId: string };
      setSaved(true);
      toast("Saved to My saved programs", "success", { label: "View list", href: `/saved/${data.folderId}` });
    } catch {
      toast("Couldn't save this program — try again.", "info");
    } finally {
      setPending(false);
    }
  }

  async function openPicker() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    setOpen(true);
    setPending(true);
    try {
      const [foldersRes, membershipRes] = await Promise.all([
        fetch("/api/folders"),
        fetch(`/api/folders/membership?programId=${encodeURIComponent(programId)}`),
      ]);
      if (foldersRes.status === 401 || membershipRes.status === 401) {
        setOpen(false);
        toast("Sign in to manage saved programs", "info", { label: "Sign in", onClick: () => clerk.openSignIn() });
        return;
      }
      const folderList = (await foldersRes.json()) as FolderSummary[];
      const membership = (await membershipRes.json()) as { folderIds: string[] };
      setFolders(folderList);
      setMemberIds(new Set(membership.folderIds));
    } catch {
      setOpen(false);
      toast("Couldn't load your folders — try again.", "info");
    } finally {
      setPending(false);
    }
  }

  async function onTriggerClick() {
    if (open) {
      setOpen(false);
      return;
    }
    if (!saved) {
      await handleFirstSave();
      return;
    }
    await openPicker();
  }

  async function toggleFolder(folder: FolderSummary, checked: boolean) {
    setRowPending((prev) => new Set(prev).add(folder.id));
    try {
      const res = checked
        ? await fetch(`/api/folders/${folder.id}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ programId }),
          })
        : await fetch(`/api/folders/${folder.id}/items/${encodeURIComponent(programId)}`, { method: "DELETE" });

      if (!res.ok) {
        toast(checked ? "Couldn't add to that folder." : "Couldn't remove from that folder.", "info");
        return;
      }
      setMemberIds((prev) => {
        const next = new Set(prev);
        if (checked) next.add(folder.id);
        else next.delete(folder.id);
        return next;
      });
      if (checked) setSaved(true);
    } catch {
      toast("Something went wrong — try again.", "info");
    } finally {
      setRowPending((prev) => {
        const next = new Set(prev);
        next.delete(folder.id);
        return next;
      });
    }
  }

  async function createFolderAndAdd() {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const createRes = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        toast(body.error ?? "Couldn't create that folder.", "info");
        return;
      }
      const created = (await createRes.json()) as { id: string; name: string };
      const newFolder: FolderSummary = { id: created.id, name: created.name, isDefault: false, isShared: false, itemCount: 0 };

      const addRes = await fetch(`/api/folders/${created.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });

      setFolders((prev) => [...(prev ?? []), newFolder]);
      if (addRes.ok) {
        setMemberIds((prev) => new Set(prev).add(created.id));
        setSaved(true);
      }
      setNewFolderName("");
    } catch {
      toast("Couldn't create that folder.", "info");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function close() {
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onTriggerClick}
        disabled={pending}
        aria-label={saved ? `Manage folders for ${name}` : `Save ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border shadow-sm backdrop-blur transition disabled:opacity-60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          saved || open
            ? "border-accent bg-accent/10 text-accent"
            : "border-border bg-surface/90 text-muted hover:border-accent hover:text-accent"
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M6 3.75A1.75 1.75 0 0 1 7.75 2h8.5A1.75 1.75 0 0 1 18 3.75v17.5l-6-4-6 4V3.75Z" />
        </svg>
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={`Save ${name} to a folder`}
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-50 w-56 rounded-lg border border-border bg-surface p-2 shadow-md"
          >
            {folders === null ? (
              <p className="px-2 py-1.5 text-sm text-muted">Loading folders…</p>
            ) : (
              <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                {folders.map((folder) => (
                  <label
                    key={folder.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      checked={memberIds.has(folder.id)}
                      disabled={rowPending.has(folder.id)}
                      onChange={(e) => toggleFolder(folder, e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-accent"
                    />
                    <span className="flex-1 truncate">{folder.name}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-1 border-t border-border pt-1.5">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createFolderAndAdd();
                  }
                }}
                placeholder="New folder…"
                maxLength={80}
                disabled={creating}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
              <button
                type="button"
                onClick={createFolderAndAdd}
                disabled={creating || !newFolderName.trim()}
                className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-surface-muted disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
