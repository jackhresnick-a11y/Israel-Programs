"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import StarRating from "@/components/ui/StarRating";
import { useToast } from "@/components/ui/Toast";

export type StandaloneReviewRow = {
  id: string;
  rating: number;
  text: string;
  reviewerName: string;
  isAnonymous: boolean;
  status: "PENDING" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
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
  const { toast } = useToast();
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

  async function handleArchive() {
    if (!confirm("Archive this review? It disappears from the program page. You can restore it later.")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/reviews/${review.id}/archive`, "POST");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/reviews/${review.id}/restore`, "POST");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setBusy(false);
    }
  }

  async function handleHardDelete() {
    if (!confirm("Permanently delete this review? This destroys its text and rating and cannot be undone. Archive is what you want most of the time.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/reviews/${review.id}`, "DELETE");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn’t delete this review — try again.", "info");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="tag">{review.program.name}</Badge>
            <StarRating rating={review.rating} />
            <span className="text-xs font-medium text-foreground">{review.reviewerName}</span>
            {review.isAnonymous && <Badge tone="info">Posted anonymously</Badge>}
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground/90">{review.text}</p>
          <p className="text-xs text-muted">{new Date(review.createdAt).toLocaleString()}</p>
          {review.moderatorNote && <p className="text-xs text-danger">Note: {review.moderatorNote}</p>}
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {(review.status === "PENDING" || review.status === "PUBLISHED" || review.status === "ARCHIVED") && (
        <div className="flex flex-wrap items-center gap-2">
          {review.status === "PENDING" && (
            <>
              <Button type="button" size="sm" disabled={busy} onClick={handleApprove}>
                Approve
              </Button>
              <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => setShowRejectNote((o) => !o)}>
                Reject
              </Button>
            </>
          )}
          {review.status === "PUBLISHED" && (
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={handleArchive}>
              Archive
            </Button>
          )}
          {review.status === "ARCHIVED" && (
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={handleRestore}>
              Restore
            </Button>
          )}
          {(review.status === "PUBLISHED" || review.status === "ARCHIVED") && (
            <button
              type="button"
              onClick={handleHardDelete}
              disabled={busy}
              className="text-xs text-muted underline underline-offset-2 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete permanently
            </button>
          )}
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
      <div className="flex flex-col divide-y divide-border rounded border border-border">
        {reviews.map((review) => (
          <ReviewRow key={review.id} review={review} />
        ))}
        {reviews.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No reviews match these filters.</p>}
      </div>
      {reviews.length === 200 && (
        <p className="text-xs text-muted">Showing the 200 oldest matches — narrow the filters to see more.</p>
      )}
    </div>
  );
}
