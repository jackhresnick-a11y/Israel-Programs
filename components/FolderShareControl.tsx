"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { folderShareUrl } from "@/lib/siteUrl";

/** Mint-and-copy in one action, per the approved design: sharing a folder
 *  publishes its name and contents to anyone with the link, so the warning
 *  is shown every time a link is (re)generated, not just the first time.
 *  Re-minting always rotates -- see lib/folders.ts's mintShareToken -- so
 *  "Copy link" on an already-shared folder reuses the existing token rather
 *  than calling mint again, and "Generate new link" is a distinct, clearly
 *  labeled action that knowingly breaks any copy already sent out. */
export default function FolderShareControl({
  folderId,
  initialShareToken,
}: {
  folderId: string;
  initialShareToken: string | null;
}) {
  const [shareToken, setShareToken] = useState(initialShareToken);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
  }

  async function handleShare() {
    setPending(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/share`, { method: "POST" });
      if (!res.ok) {
        toast("Couldn't create a share link — try again.", "info");
        return;
      }
      const data = (await res.json()) as { shareToken: string };
      setShareToken(data.shareToken);
      const url = folderShareUrl(data.shareToken);
      if (navigator.share && window.matchMedia("(hover: none), (pointer: coarse)").matches) {
        try {
          await navigator.share({ title: "Israel Programs Wiki", url });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      await copyUrl(url);
      toast(
        "Link copied — anyone with it can see this list's name and programs.",
        "success"
      );
    } finally {
      setPending(false);
    }
  }

  async function handleCopyExisting() {
    if (!shareToken) return;
    await copyUrl(folderShareUrl(shareToken));
    toast("Link copied — anyone with it can see this list's name and programs.", "success");
  }

  async function handleRevoke() {
    if (!confirm("Revoke this link? Anyone who has it will no longer be able to view this list.")) return;
    setPending(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/share`, { method: "DELETE" });
      if (res.ok) {
        setShareToken(null);
        toast("Link revoked");
      }
    } finally {
      setPending(false);
    }
  }

  if (!shareToken) {
    return (
      <Button size="sm" onClick={handleShare} disabled={pending}>
        {pending ? "Sharing…" : "Share this list"}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={handleCopyExisting}>
        Copy link
      </Button>
      <button
        type="button"
        onClick={handleShare}
        disabled={pending}
        className="text-xs text-muted underline underline-offset-2 hover:text-accent"
      >
        Generate new link
      </button>
      <button
        type="button"
        onClick={handleRevoke}
        disabled={pending}
        className="text-xs text-danger underline underline-offset-2 hover:opacity-80"
      >
        Revoke
      </button>
    </div>
  );
}
