"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { QuestionRow } from "@/components/admin/polls/QuestionManager";

export type BucketRow = {
  id: string;
  name: string;
  description: string | null;
  questionIds: string[];
  order: number;
  isCore: boolean;
  status: "ACTIVE" | "RETIRED";
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

export default function BucketManager({ buckets, questions }: { buckets: BucketRow[]; questions: QuestionRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const questionsById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const activeQuestions = useMemo(() => questions.filter((q) => q.status === "ACTIVE"), [questions]);

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

  function handleMoveBucket(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= buckets.length) return;
    const reordered = [...buckets];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    withBusy(buckets[index].id, () => api("/api/admin/polls/buckets/reorder", "POST", { ids: reordered.map((b) => b.id) }));
  }

  function handleRename(bucket: BucketRow, name: string, description: string) {
    withBusy(bucket.id, () => api(`/api/admin/polls/buckets/${bucket.id}`, "PATCH", { name, description: description || null }));
  }

  function handleRetireToggle(bucket: BucketRow) {
    const nextStatus = bucket.status === "ACTIVE" ? "RETIRED" : "ACTIVE";
    withBusy(bucket.id, () => api(`/api/admin/polls/buckets/${bucket.id}`, "PATCH", { status: nextStatus }));
  }

  function handleDelete(bucket: BucketRow) {
    if (!confirm(`Delete bucket "${bucket.name}"? It will be detached from every program using it.`)) return;
    withBusy(bucket.id, () => api(`/api/admin/polls/buckets/${bucket.id}`, "DELETE"));
  }

  function handleAddQuestion(bucket: BucketRow, questionId: string) {
    if (!questionId || bucket.questionIds.includes(questionId)) return;
    withBusy(bucket.id, () =>
      api(`/api/admin/polls/buckets/${bucket.id}`, "PATCH", { questionIds: [...bucket.questionIds, questionId] })
    );
  }

  function handleRemoveQuestion(bucket: BucketRow, questionId: string) {
    withBusy(bucket.id, () =>
      api(`/api/admin/polls/buckets/${bucket.id}`, "PATCH", {
        questionIds: bucket.questionIds.filter((id) => id !== questionId),
      })
    );
  }

  function handleMoveQuestion(bucket: BucketRow, index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= bucket.questionIds.length) return;
    const reordered = [...bucket.questionIds];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    withBusy(bucket.id, () => api(`/api/admin/polls/buckets/${bucket.id}`, "PATCH", { questionIds: reordered }));
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api("/api/admin/polls/buckets", "POST", { name: newName.trim(), description: newDescription.trim() || null });
      setNewName("");
      setNewDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bucket");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {buckets.map((bucket, index) => {
          const unusedQuestions = activeQuestions.filter((q) => !bucket.questionIds.includes(q.id));
          return (
            <div key={bucket.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 py-0"
                    disabled={index === 0 || busyId === bucket.id}
                    onClick={() => handleMoveBucket(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 py-0"
                    disabled={index === buckets.length - 1 || busyId === bucket.id}
                    onClick={() => handleMoveBucket(index, 1)}
                  >
                    ↓
                  </Button>
                </div>
                <span className="text-sm font-medium text-foreground">{bucket.name}</span>
                {bucket.isCore && <Badge tone="info">Core — always on, every program</Badge>}
                {bucket.status === "RETIRED" && <Badge tone="warning">Retired</Badge>}
                <span className="ml-auto text-xs text-muted">{bucket.questionIds.length} questions</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingId((cur) => (cur === bucket.id ? null : bucket.id))}
                >
                  {editingId === bucket.id ? "Close" : "Edit"}
                </Button>
                {!bucket.isCore && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busyId === bucket.id}
                      onClick={() => handleRetireToggle(bucket)}
                    >
                      {bucket.status === "ACTIVE" ? "Retire" : "Reactivate"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={busyId === bucket.id}
                      onClick={() => handleDelete(bucket)}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </div>
              {bucket.description && <p className="text-xs text-muted">{bucket.description}</p>}

              {editingId === bucket.id && (
                <Card className="flex flex-col gap-3 p-3">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Name
                    <Input defaultValue={bucket.name} onBlur={(e) => handleRename(bucket, e.target.value, bucket.description ?? "")} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Description
                    <Textarea
                      defaultValue={bucket.description ?? ""}
                      rows={2}
                      onBlur={(e) => handleRename(bucket, bucket.name, e.target.value)}
                    />
                  </label>

                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">Questions in this bucket, in order</span>
                    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                      {bucket.questionIds.map((qid, qi) => {
                        const question = questionsById.get(qid);
                        return (
                          <div key={qid} className="flex items-center gap-2 px-3 py-1.5">
                            <div className="flex flex-col gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-4 px-1 py-0 text-[10px]"
                                disabled={qi === 0 || busyId === bucket.id}
                                onClick={() => handleMoveQuestion(bucket, qi, -1)}
                              >
                                ↑
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-4 px-1 py-0 text-[10px]"
                                disabled={qi === bucket.questionIds.length - 1 || busyId === bucket.id}
                                onClick={() => handleMoveQuestion(bucket, qi, 1)}
                              >
                                ↓
                              </Button>
                            </div>
                            <span className="flex-1 text-sm text-foreground">
                              {question ? question.text : `(missing question: ${qid})`}
                            </span>
                            {question?.status === "RETIRED" && <Badge tone="warning">Retired</Badge>}
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={busyId === bucket.id}
                              onClick={() => handleRemoveQuestion(bucket, qid)}
                            >
                              Remove
                            </Button>
                          </div>
                        );
                      })}
                      {bucket.questionIds.length === 0 && (
                        <p className="px-3 py-2 text-xs text-muted">No questions yet.</p>
                      )}
                    </div>
                  </div>

                  {unusedQuestions.length > 0 && (
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      Add a question
                      <Select
                        value=""
                        onChange={(e) => handleAddQuestion(bucket, e.target.value)}
                        disabled={busyId === bucket.id}
                      >
                        <option value="">Choose a question...</option>
                        {unusedQuestions.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.text}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                </Card>
              )}
            </div>
          );
        })}
      </div>

      <Card className="flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-foreground">Add a bucket</h2>
        <Input placeholder="Bucket name" value={newName} onChange={(e) => setNewName(e.target.value)} className="max-w-sm" />
        <Textarea
          placeholder="Description (optional)"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          rows={2}
          className="max-w-md"
        />
        <Button type="button" size="sm" className="self-start" disabled={!newName.trim() || creating} onClick={handleCreate}>
          {creating ? "Adding..." : "Add bucket"}
        </Button>
      </Card>
    </div>
  );
}
