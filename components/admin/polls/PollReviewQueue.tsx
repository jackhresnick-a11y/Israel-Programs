"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";

type ProgramOption = { id: string; name: string; slug: string };

export type PollReviewRow = {
  id: string;
  text: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  consentAt: Date;
  moderatorNote: string | null;
  createdAt: Date;
  question: { key: string; text: string };
  program: { name: string; slug: string };
  response: {
    id: string;
    status: "PENDING" | "COUNTED" | "VOIDED";
    verified: boolean;
    email: string | null;
    ipHash: string;
    yearAttended: number | null;
    referrerToken: { label: string } | null;
    answers: { questionId: string; value: number; question: { key: string; text: string } }[];
  };
  attentionFlags: string[];
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

const ATTENTION_LABELS: Record<string, string> = {
  shared_ip: "Shared IP",
  token_over_cap: "Token over cap",
  email_domain_matches_program: "Email matches program domain",
};

function FilterBar({ programs, filters }: { programs: ProgramOption[]; filters: { status: string; programId: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/admin/polls/reviews?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Status
        <Select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)} className="w-36">
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Program
        <Select value={filters.programId} onChange={(e) => updateFilter("programId", e.target.value)} className="w-56">
          <option value="">All programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}

function ReviewRow({ review, selected, onToggleSelect }: { review: PollReviewRow; selected: boolean; onToggleSelect: () => void }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentReady = review.response.status === "COUNTED" && review.response.verified;

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/polls/reviews/${review.id}`, "PATCH", { action: "approve" });
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
      await api(`/api/admin/polls/reviews/${review.id}`, "PATCH", { action: "reject", note: rejectNote.trim() || undefined });
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
        {review.status === "PENDING" && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1 accent-accent"
            aria-label="Select for bulk reject"
          />
        )}
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="tag">{review.program.name}</Badge>
            <span className="text-xs font-medium text-foreground">{review.question.text}</span>
            <Badge tone={parentReady ? "success" : "warning"}>{parentReady ? "Verified & counted" : "Not yet verified"}</Badge>
            {review.response.referrerToken && <Badge tone="neutral">via: {review.response.referrerToken.label}</Badge>}
            {review.attentionFlags.map((f) => (
              <Badge key={f} tone="danger">
                {ATTENTION_LABELS[f] ?? f}
              </Badge>
            ))}
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground/90">{review.text}</p>
          <p className="text-xs text-muted">
            consented {new Date(review.consentAt).toLocaleString()}
            {review.response.email && <> · {review.response.email}</>}
            {review.response.yearAttended !== null && (
              <> · attended {review.response.yearAttended === 0 ? "earlier" : review.response.yearAttended}</>
            )}
          </p>
          {review.moderatorNote && <p className="text-xs text-danger">Note: {review.moderatorNote}</p>}
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setExpanded((o) => !o)}>
          {expanded ? "Hide response" : `Show full response (${review.response.answers.length} answers)`}
        </Button>
        {review.status === "PENDING" && (
          <>
            <Button type="button" size="sm" disabled={busy || !parentReady} onClick={handleApprove}>
              Approve
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => setShowRejectNote((o) => !o)}>
              Reject
            </Button>
          </>
        )}
      </div>

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

      {expanded && (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {review.response.answers.map((a) => (
            <div key={a.questionId} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
              <span className="text-foreground">{a.question.text}</span>
              <span className="font-medium text-foreground">{a.value}</span>
            </div>
          ))}
          {review.response.answers.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">This response has no answers -- review-only submission.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function PollReviewQueue({
  reviews,
  programs,
  filters,
}: {
  reviews: PollReviewRow[];
  programs: ProgramOption[];
  filters: { status: string; programId: string };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkNote, setBulkNote] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkReject() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      await api("/api/admin/polls/reviews/bulk-reject", "POST", {
        ids: Array.from(selected),
        note: bulkNote.trim() || undefined,
      });
      setSelected(new Set());
      setBulkNote("");
      router.refresh();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to bulk-reject");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <FilterBar programs={programs} filters={filters} />

      {selected.size > 0 && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-xs text-muted">{selected.size} selected</span>
          <Input
            placeholder="Optional note for all"
            value={bulkNote}
            onChange={(e) => setBulkNote(e.target.value)}
            className="max-w-xs text-xs"
          />
          <Button type="button" variant="destructive" size="sm" disabled={bulkBusy} onClick={handleBulkReject}>
            {bulkBusy ? "Rejecting..." : `Reject ${selected.size}`}
          </Button>
          {bulkError && <span className="text-xs text-danger">{bulkError}</span>}
        </Card>
      )}

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {reviews.map((review) => (
          <ReviewRow
            key={review.id}
            review={review}
            selected={selected.has(review.id)}
            onToggleSelect={() => toggleSelect(review.id)}
          />
        ))}
        {reviews.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No reviews match these filters.</p>}
      </div>
      {reviews.length === 200 && (
        <p className="text-xs text-muted">Showing the 200 oldest matches -- narrow the filters to see more.</p>
      )}
    </div>
  );
}
