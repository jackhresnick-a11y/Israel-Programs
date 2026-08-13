"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

type ProgramOption = { id: string; name: string; slug: string };

/** "question" rows come from PollReview (per-question comments); "prompt" rows come from
 * PollElaborationAnswer (the end-of-poll elaboration block) -- merged into one queue by
 * app/admin/polls/reviews/page.tsx. `question` holds the prompt's key/text for a "prompt"
 * row too (promptKey/promptText), so the shared rendering below needs no branching to
 * show a label -- only the approval-readiness rule and the API base path differ by kind,
 * both handled explicitly where they matter. */
export type PollReviewRow = {
  id: string;
  kind: "question" | "prompt";
  text: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "ARCHIVED";
  consentAt: Date;
  moderatorNote: string | null;
  archivedAt: Date | null;
  archivedBy: string | null;
  archivedByName: string | null;
  createdAt: Date;
  question: { key: string; text: string };
  program: { name: string; slug: string };
  response: {
    id: string;
    status: "PENDING" | "INCOMPLETE" | "COUNTED" | "FLAGGED" | "VOIDED";
    verified: boolean;
    email: string | null;
    ipHash: string;
    yearAttended: number | null;
    referrerToken: { label: string } | null;
    answers: { questionId: string; value: number; question: { key: string; text: string } }[];
  };
  attentionFlags: string[];
};

const API_BASE: Record<PollReviewRow["kind"], string> = {
  question: "/api/admin/polls/reviews",
  prompt: "/api/admin/polls/elaborations",
};

const BULK_REJECT_URL: Record<PollReviewRow["kind"], string> = {
  question: "/api/admin/polls/reviews/bulk-reject",
  prompt: "/api/admin/polls/elaborations/bulk-reject",
};

/** Whether the parent response's current status lets this row be approved right now --
 * a UI hint only, the server is the actual gate. PollReview requires the parent response
 * to be COUNTED (approvePollReview); PollElaborationAnswer only refuses VOIDED/FLAGGED
 * (approveElaborationAnswer -- see its doc comment for why the bar is looser). Using the
 * question rule for a prompt row would incorrectly grey out Approve for an INCOMPLETE
 * response's elaboration answer, which the server would actually accept. */
function canApproveRow(review: PollReviewRow): boolean {
  if (review.kind === "prompt") {
    return review.response.status !== "VOIDED" && review.response.status !== "FLAGGED";
  }
  return review.response.status === "COUNTED";
}

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
          <option value="ARCHIVED">Archived</option>
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
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentReady = canApproveRow(review);
  const apiBase = API_BASE[review.kind];
  const itemNoun = review.kind === "prompt" ? "answer" : "review";

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      await api(`${apiBase}/${review.id}`, "PATCH", { action: "approve" });
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
      await api(`${apiBase}/${review.id}`, "PATCH", { action: "reject", note: rejectNote.trim() || undefined });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!confirm(`Archive this ${itemNoun}? It disappears from the program page. You can restore it later.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${apiBase}/${review.id}/archive`, "POST");
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
      await api(`${apiBase}/${review.id}/restore`, "POST");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setBusy(false);
    }
  }

  async function handleHardDelete() {
    if (
      !confirm(
        `Permanently delete this ${itemNoun}? This destroys its text and consent record and cannot be undone. Archive is what you want most of the time.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`${apiBase}/${review.id}`, "DELETE");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : `Couldn’t delete this ${itemNoun} — try again.`, "info");
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
            {review.kind === "prompt" && <Badge tone="neutral">Prompt</Badge>}
            <span className="text-xs font-medium text-foreground">{review.question.text}</span>
            {review.kind === "prompt" ? (
              <Badge tone={parentReady ? "success" : "warning"}>{parentReady ? "Ready to publish" : "Held (response voided/flagged)"}</Badge>
            ) : (
              <Badge tone={parentReady ? "success" : "warning"}>{parentReady ? "Counted" : "Not yet counted"}</Badge>
            )}
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
          {review.status === "ARCHIVED" && review.archivedAt && (
            <p className="text-xs text-muted">
              Archived by {review.archivedByName ?? "Unknown"} on {new Date(review.archivedAt).toLocaleDateString()}
            </p>
          )}
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
        {review.status === "APPROVED" && (
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={handleArchive}>
            Archive
          </Button>
        )}
        {review.status === "ARCHIVED" && (
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={handleRestore}>
            Restore
          </Button>
        )}
        {(review.status === "APPROVED" || review.status === "ARCHIVED") && (
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
        <div className="flex flex-col divide-y divide-border rounded border border-border">
          {review.response.answers.map((a) => (
            <div key={a.questionId} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
              <span className="text-foreground">{a.question.text}</span>
              <span className="font-medium text-foreground">{a.value}</span>
            </div>
          ))}
          {review.response.answers.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">This response has no answers — review-only submission.</p>
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
      // A bulk selection can span both row kinds -- split by kind and hit each row's own
      // endpoint, since PollReview and PollElaborationAnswer are separate tables with
      // separate bulk-reject routes.
      const kindById = new Map(reviews.map((r) => [r.id, r.kind]));
      const idsByKind: Record<PollReviewRow["kind"], string[]> = { question: [], prompt: [] };
      for (const id of selected) {
        const kind = kindById.get(id);
        if (kind) idsByKind[kind].push(id);
      }
      const note = bulkNote.trim() || undefined;
      await Promise.all(
        (Object.entries(idsByKind) as [PollReviewRow["kind"], string[]][])
          .filter(([, ids]) => ids.length > 0)
          .map(([kind, ids]) => api(BULK_REJECT_URL[kind], "POST", { ids, note }))
      );
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

      <div className="flex flex-col divide-y divide-border rounded border border-border">
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
      {reviews.length >= 200 && (
        <p className="text-xs text-muted">Showing the oldest matches — narrow the filters to see more.</p>
      )}
    </div>
  );
}
