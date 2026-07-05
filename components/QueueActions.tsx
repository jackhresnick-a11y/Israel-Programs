"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function QueueActions({
  approveUrl,
  rejectUrl,
}: {
  approveUrl: string;
  rejectUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function act(action: "approve" | "reject") {
    setBusy(action);
    const res = await fetch(action === "approve" ? approveUrl : rejectUrl, {
      method: "POST",
    });
    setBusy(null);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => act("approve")}
        disabled={busy !== null}
        className="rounded-lg bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50"
      >
        {busy === "approve" ? "Approving..." : "Approve"}
      </button>
      <button
        onClick={() => act("reject")}
        disabled={busy !== null}
        className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
      >
        {busy === "reject" ? "Rejecting..." : "Reject"}
      </button>
    </div>
  );
}
