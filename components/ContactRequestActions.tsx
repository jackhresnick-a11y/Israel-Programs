"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ContactRequestActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markReplied() {
    setBusy(true);
    const res = await fetch(`/api/contact-requests/${id}`, { method: "PATCH" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      onClick={markReplied}
      disabled={busy}
      className="w-fit rounded-lg border border-black/10 px-3 py-1 text-xs hover:bg-black/[.04] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/[.06]"
    >
      {busy ? "Saving..." : "Mark as replied"}
    </button>
  );
}
