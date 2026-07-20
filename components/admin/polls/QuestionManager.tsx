"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";

export type QuestionRow = {
  id: string;
  key: string;
  text: string;
  type: "STARS" | "RADIO" | "DROPDOWN";
  labels: string[];
  status: "ACTIVE" | "RETIRED";
  scaleType: "EVALUATIVE" | "DESCRIPTIVE";
  version: number;
  answerCount: number;
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

const EMPTY_LABELS: [string, string, string, string, string] = ["", "", "", "", ""];

function QuestionForm({
  initial,
  onSubmit,
  submitLabel,
  busy,
}: {
  initial?: QuestionRow;
  onSubmit: (input: {
    key?: string;
    text: string;
    type: QuestionRow["type"];
    labels: string[];
    scaleType: QuestionRow["scaleType"];
  }) => void;
  submitLabel: string;
  busy: boolean;
}) {
  const [key, setKey] = useState(initial?.key ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [type, setType] = useState<QuestionRow["type"]>(initial?.type ?? "STARS");
  const [labels, setLabels] = useState<string[]>(initial?.labels ?? [...EMPTY_LABELS]);
  const [scaleType, setScaleType] = useState<QuestionRow["scaleType"]>(initial?.scaleType ?? "EVALUATIVE");

  const valid = text.trim().length > 0 && labels.every((l) => l.trim().length > 0) && (initial || key.trim().length > 0);

  return (
    <div className="flex flex-col gap-2">
      {!initial && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Key (stable identifier, lowercase/numbers/underscores only)
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. staff_quality" />
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Question text
        <Input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Type
        <Select value={type} onChange={(e) => setType(e.target.value as QuestionRow["type"])} className="w-40">
          <option value="STARS">Stars</option>
          <option value="RADIO">Radio</option>
          <option value="DROPDOWN">Dropdown</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Scale type
        <Select
          value={scaleType}
          onChange={(e) => setScaleType(e.target.value as QuestionRow["scaleType"])}
          className="w-40"
        >
          <option value="EVALUATIVE">Evaluative (higher = better)</option>
          <option value="DESCRIPTIVE">Descriptive (neutral spectrum)</option>
        </Select>
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        Labels (value 1 through 5)
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {labels.map((label, i) => (
            <Input
              key={i}
              value={label}
              placeholder={String(i + 1)}
              onChange={(e) => setLabels((prev) => prev.map((l, idx) => (idx === i ? e.target.value : l)))}
            />
          ))}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        className="self-start"
        disabled={!valid || busy}
        onClick={() =>
          onSubmit({ key: initial ? undefined : key.trim(), text: text.trim(), type, labels, scaleType })
        }
      >
        {busy ? "Saving..." : submitLabel}
      </Button>
    </div>
  );
}

export default function QuestionManager({ questions }: { questions: QuestionRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  function handleSaveEdit(
    question: QuestionRow,
    input: { text: string; type: QuestionRow["type"]; labels: string[]; scaleType: QuestionRow["scaleType"] }
  ) {
    const textChanged = input.text !== question.text;
    if (textChanged && question.answerCount > 0) {
      const confirmed = confirm(
        `"${question.key}" already has ${question.answerCount} answer${question.answerCount === 1 ? "" : "s"}. ` +
          `Changing its text will bump it to version ${question.version + 1} so past answers stay attributed to the ` +
          `wording they were actually given under. Continue?`
      );
      if (!confirmed) return;
    }
    withBusy(question.id, async () => {
      await api(`/api/admin/polls/questions/${question.id}`, "PATCH", input);
      setEditingId(null);
    });
  }

  function handleRetireToggle(question: QuestionRow) {
    const nextStatus = question.status === "ACTIVE" ? "RETIRED" : "ACTIVE";
    withBusy(question.id, () => api(`/api/admin/polls/questions/${question.id}`, "PATCH", { status: nextStatus }));
  }

  function handleDelete(question: QuestionRow) {
    if (!confirm(`Delete question "${question.key}"? This only works because it has zero answers.`)) return;
    withBusy(question.id, () => api(`/api/admin/polls/questions/${question.id}`, "DELETE"));
  }

  async function handleCreate(input: {
    key?: string;
    text: string;
    type: QuestionRow["type"];
    labels: string[];
    scaleType: QuestionRow["scaleType"];
  }) {
    setCreating(true);
    setError(null);
    try {
      await api("/api/admin/polls/questions", "POST", input);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create question");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {questions.map((question) => (
          <div key={question.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="tag">{question.key}</Badge>
              <span className="text-sm font-medium text-foreground">{question.text}</span>
              <Badge tone="neutral">{question.type}</Badge>
              {question.scaleType === "DESCRIPTIVE" && <Badge tone="tag">Descriptive</Badge>}
              {question.status === "RETIRED" && <Badge tone="warning">Retired</Badge>}
              <span className="ml-auto text-xs text-muted">
                v{question.version} · {question.answerCount} answer{question.answerCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 text-xs text-muted">
              {question.labels.map((l, i) => (
                <span key={i} className="rounded bg-surface-muted px-1.5 py-0.5">
                  {i + 1}: {l}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditingId((cur) => (cur === question.id ? null : question.id))}
              >
                {editingId === question.id ? "Cancel" : "Edit"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busyId === question.id}
                onClick={() => handleRetireToggle(question)}
              >
                {question.status === "ACTIVE" ? "Retire" : "Reactivate"}
              </Button>
              {question.answerCount === 0 && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busyId === question.id}
                  onClick={() => handleDelete(question)}
                >
                  Delete
                </Button>
              )}
            </div>
            {editingId === question.id && (
              <Card className="p-3">
                <QuestionForm
                  initial={question}
                  submitLabel="Save changes"
                  busy={busyId === question.id}
                  onSubmit={(input) => handleSaveEdit(question, input)}
                />
              </Card>
            )}
          </div>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Add a question</h2>
        <QuestionForm submitLabel="Create question" busy={creating} onSubmit={handleCreate} />
      </Card>
    </div>
  );
}
