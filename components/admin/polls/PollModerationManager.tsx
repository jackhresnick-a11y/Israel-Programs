"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { PollFlag } from "@/lib/pollShared";

type ProgramOption = { id: string; name: string; slug: string };

export type PollResponseRow = {
  id: string;
  programId: string;
  program: { name: string; slug: string };
  userId: string | null;
  email: string | null;
  verified: boolean;
  referrerTokenId: string | null;
  referrerToken: { label: string } | null;
  yearAttended: number | null;
  completion: "FULL" | "PARTIAL" | "DROPPED" | null;
  status: "PENDING" | "COUNTED" | "VOIDED";
  flags: string[];
  ipHash: string;
  createdAt: Date;
  answers: {
    questionId: string;
    questionVersion: number;
    value: number;
    question: { key: string; text: string };
  }[];
  /** Ids in naQuestionIds, resolved to text -- questions the respondent explicitly
   * marked N/A, distinct from a merely-untouched question. See
   * lib/pollResponses.ts's listPollResponses. */
  naQuestions: { id: string; key: string; text: string }[];
  /** presentedQuestionIds minus whatever has a PollAnswer row minus naQuestions,
   * resolved to text -- left untouched with no explicit mark either way. See
   * lib/pollResponses.ts's listPollResponses. */
  skippedQuestions: { id: string; key: string; text: string }[];
  reviews: {
    id: string;
    text: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    question: { key: string; text: string };
  }[];
};

const REVIEW_STATUS_TONE: Record<PollResponseRow["reviews"][number]["status"], "neutral" | "success" | "danger"> = {
  PENDING: "neutral",
  APPROVED: "success",
  REJECTED: "danger",
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

const FLAG_LABELS: Record<PollFlag, string> = {
  token_over_cap: "Token over cap",
  token_revoked: "Token revoked",
  token_expired: "Token expired",
  repeat_ip: "Repeat IP",
  duplicate_email: "Duplicate email",
};

const STATUS_TONE: Record<PollResponseRow["status"], "neutral" | "success" | "danger"> = {
  PENDING: "neutral",
  COUNTED: "success",
  VOIDED: "danger",
};

function FilterBar({ programs, filters }: { programs: ProgramOption[]; filters: Record<string, string> }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/admin/polls/moderation?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
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
      <label className="flex flex-col gap-1 text-xs text-muted">
        Status
        <Select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)} className="w-36">
          <option value="">Any status</option>
          <option value="PENDING">Pending</option>
          <option value="COUNTED">Counted</option>
          <option value="VOIDED">Voided</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Verified
        <Select value={filters.verified} onChange={(e) => updateFilter("verified", e.target.value)} className="w-32">
          <option value="">Either</option>
          <option value="true">Verified</option>
          <option value="false">Unverified</option>
        </Select>
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={filters.flagged === "true"}
          onChange={(e) => updateFilter("flagged", e.target.checked ? "true" : "")}
          className="accent-accent"
        />
        Flagged only
      </label>
    </div>
  );
}

function KillSwitch({ initialOn }: { initialOn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await api("/api/admin/polls/kill-switch", "PATCH", { on: !on });
      setOn(!on);
      router.refresh();
    } catch {
      // Toggle failed -- state stays as-is, no optimistic flip to undo.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={`flex items-center justify-between gap-3 p-4 ${on ? "border-danger/40 bg-danger-bg" : ""}`}>
      <div>
        <p className="text-sm font-semibold text-foreground">Global kill switch</p>
        <p className="text-xs text-muted">
          {on
            ? "ON -- every program's results are hidden right now, regardless of per-program settings."
            : "OFF -- results show per-program config as normal."}
        </p>
      </div>
      <Button type="button" variant={on ? "destructive" : "secondary"} size="sm" disabled={busy} onClick={toggle}>
        {busy ? "..." : on ? "Turn off" : "Turn on"}
      </Button>
    </Card>
  );
}

function ResponseRow({ response }: { response: PollResponseRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: "void" | "restore") {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/polls/responses/${response.id}`, "PATCH", { action });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{response.program.name}</span>
        <Badge tone={STATUS_TONE[response.status]}>{response.status}</Badge>
        <Badge tone={response.verified ? "success" : "neutral"}>{response.verified ? "Verified" : "Unverified"}</Badge>
        {response.flags.map((f) => (
          <Badge key={f} tone="warning">
            {FLAG_LABELS[f as PollFlag] ?? f}
          </Badge>
        ))}
        {response.referrerToken && <Badge tone="tag">via: {response.referrerToken.label}</Badge>}
        <span className="ml-auto text-xs text-muted">{new Date(response.createdAt).toLocaleString()}</span>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {response.userId && <span>user: {response.userId}</span>}
        {response.email && <span>email: {response.email}</span>}
        {response.yearAttended !== null && (
          <span>attended: {response.yearAttended === 0 ? "Earlier" : response.yearAttended}</span>
        )}
        <span>ip hash: {response.ipHash.slice(0, 12)}…</span>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
          {open
            ? "Hide details"
            : `Show details (${response.answers.length} answered, ${response.naQuestions.length} N/A, ${response.skippedQuestions.length} skipped, ${response.reviews.length} reviews)`}
        </Button>
        {response.status !== "VOIDED" ? (
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => handleAction("void")}>
            Void
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => handleAction("restore")}>
            Restore
          </Button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {response.answers.map((a) => (
              <div key={a.questionId} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                <span className="text-foreground">
                  {a.question.text} <span className="text-muted">(v{a.questionVersion})</span>
                </span>
                <span className="font-medium text-foreground">{a.value}</span>
              </div>
            ))}
            {response.naQuestions.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                <span className="text-muted">{q.text}</span>
                <Badge tone="info">N/A</Badge>
              </div>
            ))}
            {response.skippedQuestions.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                <span className="text-muted">{q.text}</span>
                <Badge tone="neutral">Skipped</Badge>
              </div>
            ))}
            {response.answers.length === 0 && response.naQuestions.length === 0 && response.skippedQuestions.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted">No questions were presented to this response.</p>
            )}
          </div>
          {response.reviews.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <p className="text-xs font-semibold text-muted">Reviews</p>
              {response.reviews.map((review) => (
                <div key={review.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{review.question.text}</span>
                    <Badge tone={REVIEW_STATUS_TONE[review.status]}>{review.status}</Badge>
                  </div>
                  <p className="text-xs text-foreground/80">{review.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PollModerationManager({
  responses,
  programs,
  killSwitchOn,
  filters,
}: {
  responses: PollResponseRow[];
  programs: ProgramOption[];
  killSwitchOn: boolean;
  filters: { programId: string; status: string; verified: string; flagged: string };
}) {
  return (
    <div className="flex flex-col gap-6">
      <KillSwitch initialOn={killSwitchOn} />
      <FilterBar programs={programs} filters={filters} />
      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {responses.map((r) => (
          <ResponseRow key={r.id} response={r} />
        ))}
        {responses.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No responses match these filters.</p>}
      </div>
      {responses.length === 200 && (
        <p className="text-xs text-muted">Showing the 200 most recent matches -- narrow the filters to see more specific results.</p>
      )}
    </div>
  );
}
