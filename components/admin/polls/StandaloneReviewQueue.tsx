"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

export type StandaloneReviewRow = {
  id: string;
  rating: number;
  text: string;
  reviewerName: string;
  isAnonymous: boolean;
  status: "PENDING" | "PUBLISHED" | "REJECTED";
  moderatorNote: string | null;
  createdAt: Date;
  program: { name: string; slug: string };
};

async function api(url: string, method: string, body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error ?? "Request failed");
  }
  return res.json().catch(() => ({}));
}

function ReviewRow({ review }: { review: StandaloneReviewRow }) {
  const router = useRouter();
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/reviews/${review.id}`, "PATCH", { action: "approve" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/reviews/${review.id}`, "PATCH", { action: "reject", note: rejectNote.trim() || undefined });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="tag">{review.program.name}</Badge>
            <span className="text-xs text-accent">{"★".repeat(review.rating)}</span>
            <span className="text-xs font-medium text-foreground">{review.reviewerName}</span>
            {review.isAnonymous && <Badge tone="info">Posted anonymously</Badge>}
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground/90">{review.text}</p>
          <p className="text-xs text-muted">{new Date(review.createdAt).toLocaleString()}</p>
          {review.moderatorNote && <p className="text-xs text-danger">Note: {review.moderatorNote}</p>}
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {review.status === "PENDING" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={handleApprove}>
            Approve
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => setShowRejectNote((o) => !o)}>
            Reject
          </Button>
        </div>
      )}

      {showRejectNote && review.status === "PENDING" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Optional note (why this was rejected)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            className="max-w-sm text-xs"
          />
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={handleReject}>
            Confirm reject
          </Button>
        </div>
      )}
    </div>
  );
}

export default function StandaloneReviewQueue({ reviews }: { reviews: StandaloneReviewRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Written reviews</h2>
      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {reviews.map((review) => (
          <ReviewRow key={review.id} review={review} />
        ))}
        {reviews.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No reviews match these filters.</p>}
      </div>
      {reviews.length === 200 && (
        <p className="text-xs text-muted">Showing the 200 oldest matches -- narrow the filters to see more.</p>
      )}
    </div>
  );
}
