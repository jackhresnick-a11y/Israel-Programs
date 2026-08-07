"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsModerator } from "@/lib/useModeratorRole";

export default function DeleteProgramButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isModerator = useIsModerator();
  const { toast } = useToast();

  async function handleArchive() {
    if (!confirm("Archive this program? It disappears from browse, search, and the sitemap. Poll responses and outreach history are kept.")) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/programs/${id}/archive`, { method: "POST" });
    if (res.ok) {
      router.push("/programs");
      router.refresh();
      return;
    }
    setBusy(false);
    const body = await res.json().catch(() => null);
    toast(body?.error ?? "Couldn’t archive this program — try again.", "info");
  }

  async function handleHardDelete() {
    if (!confirm("Permanently delete this program? This destroys its poll responses and reviews and cannot be undone. Most of the time Archive is what you want instead.")) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/programs/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/programs");
      router.refresh();
      return;
    }
    setBusy(false);
    const body = await res.json().catch(() => null);
    toast(body?.error ?? "Couldn’t delete this program — try again.", "info");
  }

  if (!isModerator) return null;

  return (
    <div className="flex items-center gap-2">
      <Button variant="destructive" size="sm" onClick={handleArchive} disabled={busy}>
        {busy ? "Working..." : "Archive"}
      </Button>
      <button
        type="button"
        onClick={handleHardDelete}
        disabled={busy}
        className="text-xs text-muted underline underline-offset-2 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
      >
        Delete permanently
      </button>
    </div>
  );
}
