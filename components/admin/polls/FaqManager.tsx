"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";

type ProgramOption = { id: string; name: string; slug: string };

export type PendingQuestionRow = {
  id: string;
  question: string;
  createdAt: Date;
  program: { name: string; slug: string };
};

export type FaqRow = {
  id: string;
  question: string;
  answer: string | null;
  status: "DRAFT" | "PUBLISHED" | "REJECTED";
  sortOrder: number;
  source: string | null;
  moderatorNote: string | null;
  createdAt: Date;
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

const STATUS_TONE: Record<FaqRow["status"], "success" | "neutral" | "danger"> = {
  PUBLISHED: "success",
  DRAFT: "neutral",
  REJECTED: "danger",
};

function PendingQuestionRow({ item }: { item: PendingQuestionRow }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    if (!answer.trim()) {
      setError("Write an answer before publishing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/polls/faqs/${item.id}`, "PATCH", { answer: answer.trim(), status: "PUBLISHED" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/polls/faqs/${item.id}`, "PATCH", { status: "REJECTED", note: rejectNote.trim() || undefined });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="tag">{item.program.name}</Badge>
        <span className="text-xs text-muted">asked {new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <p className="text-sm font-medium text-foreground">{item.question}</p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <Textarea
        placeholder="Write an answer to publish this question..."
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={2}
        className="text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={handlePublish}>
          Answer &amp; publish
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => setShowReject((o) => !o)}>
          Reject
        </Button>
      </div>
      {showReject && (
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

function FaqEntryRow({
  faq,
  index,
  count,
  onMove,
  busy,
}: {
  faq: FaqRow;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  busy: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer ?? "");
  const [rowBusy, setRowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVisitor = faq.source === "visitor";

  async function handleSave() {
    setRowBusy(true);
    setError(null);
    try {
      await api(`/api/admin/polls/faqs/${faq.id}`, "PATCH", { question: question.trim(), answer: answer.trim() || null });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setRowBusy(false);
    }
  }

  async function handleToggleStatus() {
    setRowBusy(true);
    setError(null);
    try {
      await api(`/api/admin/polls/faqs/${faq.id}`, "PATCH", {
        status: faq.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setRowBusy(false);
    }
  }

  async function handleDelete() {
    setRowBusy(true);
    setError(null);
    try {
      await api(`/api/admin/polls/faqs/${faq.id}`, "DELETE");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setRowBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col">
          <Button type="button" variant="secondary" size="sm" disabled={index === 0 || busy} onClick={() => onMove(-1)}>
            ↑
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={index === count - 1 || busy}
            onClick={() => onMove(1)}
          >
            ↓
          </Button>
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{faq.question}</span>
          {faq.answer && <span className="text-xs text-muted">{faq.answer}</span>}
        </div>
        <Badge tone={STATUS_TONE[faq.status]}>{faq.status}</Badge>
        {faq.source && <Badge tone="neutral">{faq.source}</Badge>}
        {faq.moderatorNote && <span className="text-xs text-danger">Note: {faq.moderatorNote}</span>}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing((o) => !o)}>
          {editing ? "Cancel" : "Edit"}
        </Button>
        {faq.status !== "REJECTED" && (
          <Button type="button" variant="secondary" size="sm" disabled={rowBusy} onClick={handleToggleStatus}>
            {faq.status === "PUBLISHED" ? "Unpublish" : "Publish"}
          </Button>
        )}
        {!isVisitor && (
          <Button type="button" variant="destructive" size="sm" disabled={rowBusy} onClick={handleDelete}>
            Delete
          </Button>
        )}
      </div>

      {editing && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" />
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer" rows={3} />
          <Button type="button" size="sm" className="self-start" disabled={rowBusy} onClick={handleSave}>
            {rowBusy ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

function AddFaqForm({ programId }: { programId: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [source, setSource] = useState("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/polls/faqs", "POST", {
        programId,
        question: question.trim(),
        answer: answer.trim() || null,
        source: source.trim() || "admin",
        status: "DRAFT",
      });
      setQuestion("");
      setAnswer("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-2 p-4">
      <h3 className="text-sm font-semibold text-foreground">Add an FAQ entry</h3>
      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}
      <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" />
      <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer (optional -- can add later)" rows={2} />
      <label className="flex flex-col gap-1 text-xs text-muted">
        Source
        <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="staff / admin / alumni poll" className="max-w-xs" />
      </label>
      <Button type="button" size="sm" className="self-start" disabled={busy || !question.trim()} onClick={handleCreate}>
        {busy ? "Adding..." : "Add as draft"}
      </Button>
    </Card>
  );
}

export default function FaqManager({
  pending,
  programs,
  selectedProgramId,
  faqs,
}: {
  pending: PendingQuestionRow[];
  programs: ProgramOption[];
  selectedProgramId: string;
  faqs: FaqRow[];
}) {
  const router = useRouter();
  const [reorderBusy, setReorderBusy] = useState(false);

  function handleProgramChange(programId: string) {
    router.push(`/admin/polls/faqs?programId=${programId}`);
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= faqs.length) return;
    const reordered = [...faqs];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setReorderBusy(true);
    try {
      await api("/api/admin/polls/faqs/reorder", "POST", { ids: reordered.map((f) => f.id) });
      router.refresh();
    } finally {
      setReorderBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Pending questions ({pending.length})</h2>
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {pending.map((item) => (
            <PendingQuestionRow key={item.id} item={item} />
          ))}
          {pending.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No pending questions.</p>}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="text-sm font-semibold text-foreground">Curated FAQs by program</h2>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Program
            <Select value={selectedProgramId} onChange={(e) => handleProgramChange(e.target.value)} className="w-64">
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {selectedProgramId && <AddFaqForm programId={selectedProgramId} />}

        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {faqs.map((faq, index) => (
            <FaqEntryRow key={faq.id} faq={faq} index={index} count={faqs.length} onMove={(d) => handleMove(index, d)} busy={reorderBusy} />
          ))}
          {faqs.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No FAQ entries for this program yet.</p>}
        </div>
      </div>
    </div>
  );
}
