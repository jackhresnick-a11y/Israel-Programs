"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function QueueActions({
  approveUrl,
  rejectUrl,
  reviewUrl,
}: {
  approveUrl?: string;
  rejectUrl: string;
  reviewUrl?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function act(action: "approve" | "reject") {
    const url = action === "approve" ? approveUrl : rejectUrl;
    if (!url) return;
    setBusy(action);
    const res = await fetch(url, { method: "POST" });
    setBusy(null);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex gap-2">
      {reviewUrl && (
        <Link
          href={reviewUrl}
          className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-amber-400"
        >
          Review
        </Link>
      )}
      {approveUrl && (
        <button
          onClick={() => act("approve")}
          disabled={busy !== null}
          className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-amber-400 disabled:opacity-50"
        >
          {busy === "approve" ? "Approving..." : "Approve"}
        </button>
      )}
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
