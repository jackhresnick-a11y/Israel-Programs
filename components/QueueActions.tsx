"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/Button";

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
        <Link href={reviewUrl} className={buttonVariants({ variant: "primary", size: "sm" })}>
          Review
        </Link>
      )}
      {approveUrl && (
        <button
          onClick={() => act("approve")}
          disabled={busy !== null}
          className={buttonVariants({ variant: "primary", size: "sm" })}
        >
          {busy === "approve" ? "Approving..." : "Approve"}
        </button>
      )}
      <button
        onClick={() => act("reject")}
        disabled={busy !== null}
        className={buttonVariants({ variant: "destructive", size: "sm" })}
      >
        {busy === "reject" ? "Rejecting..." : "Reject"}
      </button>
    </div>
  );
}
