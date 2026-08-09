"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import type { DurationType } from "@/app/generated/prisma/enums";
import { assembleProgramsHref } from "@/lib/finderTargets";

export type FinderOptionRow = {
  id: string;
  label: string;
  helpText: string | null;
  order: number;
  status: "ACTIVE" | "RETIRED";
  tagSlugs: string[];
  durationValues: string[];
};

export type FinderQuestionRow = {
  id: string;
  prompt: string;
  helpText: string | null;
  order: number;
  status: "ACTIVE" | "RETIRED";
  options: FinderOptionRow[];
};

export type TagOption = { slug: string; name: string; category: string | null };
export type DurationOptionRow = { value: DurationType; label: string };

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

/**
 * Admin CRUD for the /find narrowing flow: questions (prompt, help text, order,
 * active/retired) each own an ordered set of options (label, help text,
 * active/retired, and the tag slugs / duration values that option contributes to the
 * /programs redirect -- see lib/finder.ts's buildProgramsHref). Same
 * fetch-then-router.refresh() shape as RegionManager/TagManager -- no client-side
 * cache of its own, the server component re-fetches on every mutation.
 */
export default function FinderQuestionsManager({
  questions,
  tags,
  durationOptions,
}: {
  questions: FinderQuestionRow[];
  tags: TagOption[];
  durationOptions: DurationOptionRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newPrompt, setNewPrompt] = useState("");
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [newOptionLabel, setNewOptionLabel] = useState<Record<string, string>>({});
  const [creatingOptionFor, setCreatingOptionFor] = useState<string | null>(null);

  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  const tagsByCategory = new Map<string, TagOption[]>();
  for (const tag of tags) {
    const key = tag.category ?? "uncategorized";
    const bucket = tagsByCategory.get(key);
    if (bucket) bucket.push(tag);
    else tagsByCategory.set(key, [tag]);
  }

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

  function handleRenamePrompt(question: FinderQuestionRow, prompt: string) {
    if (!prompt.trim() || prompt === question.prompt) return;
    withBusy(question.id, () => api(`/api/admin/find/questions/${question.id}`, "PATCH", { prompt }));
  }

  function handleQuestionHelpTextChange(question: FinderQuestionRow, helpText: string) {
    const next = helpText.trim() || null;
    if (next === question.helpText) return;
    withBusy(question.id, () =>
      api(`/api/admin/find/questions/${question.id}`, "PATCH", { helpText: next })
    );
  }

  function handleToggleQuestionStatus(question: FinderQuestionRow) {
    const next = question.status === "ACTIVE" ? "RETIRED" : "ACTIVE";
    withBusy(question.id, () =>
      api(`/api/admin/find/questions/${question.id}`, "PATCH", { status: next })
    );
  }

  function handleMoveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sortedQuestions.length) return;
    const a = sortedQuestions[index];
    const b = sortedQuestions[target];
    withBusy(a.id, async () => {
      await api(`/api/admin/find/questions/${a.id}`, "PATCH", { order: b.order });
      await api(`/api/admin/find/questions/${b.id}`, "PATCH", { order: a.order });
    });
  }

  function handleDeleteQuestion(question: FinderQuestionRow) {
    if (!confirm(`Delete question "${question.prompt}"? Its options are deleted too.`)) return;
    withBusy(question.id, () => api(`/api/admin/find/questions/${question.id}`, "DELETE"));
  }

  async function handleCreateQuestion() {
    if (!newPrompt.trim()) return;
    setCreatingQuestion(true);
    setError(null);
    try {
      await api("/api/admin/find/questions", "POST", { prompt: newPrompt });
      setNewPrompt("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create question");
    } finally {
      setCreatingQuestion(false);
    }
  }

  function handleRenameOptionLabel(option: FinderOptionRow, label: string) {
    if (!label.trim() || label === option.label) return;
    withBusy(option.id, () => api(`/api/admin/find/options/${option.id}`, "PATCH", { label }));
  }

  function handleOptionHelpTextChange(option: FinderOptionRow, helpText: string) {
    const next = helpText.trim() || null;
    if (next === option.helpText) return;
    withBusy(option.id, () => api(`/api/admin/find/options/${option.id}`, "PATCH", { helpText: next }));
  }

  function handleToggleOptionStatus(option: FinderOptionRow) {
    const next = option.status === "ACTIVE" ? "RETIRED" : "ACTIVE";
    withBusy(option.id, () => api(`/api/admin/find/options/${option.id}`, "PATCH", { status: next }));
  }

  function handleToggleOptionTag(option: FinderOptionRow, slug: string) {
    const next = option.tagSlugs.includes(slug)
      ? option.tagSlugs.filter((s) => s !== slug)
      : [...option.tagSlugs, slug];
    withBusy(option.id, () => api(`/api/admin/find/options/${option.id}`, "PATCH", { tagSlugs: next }));
  }

  function handleToggleOptionDuration(option: FinderOptionRow, value: string) {
    const next = option.durationValues.includes(value)
      ? option.durationValues.filter((v) => v !== value)
      : [...option.durationValues, value];
    withBusy(option.id, () =>
      api(`/api/admin/find/options/${option.id}`, "PATCH", { durationValues: next })
    );
  }

  function handleMoveOption(question: FinderQuestionRow, index: number, direction: -1 | 1) {
    const opts = [...question.options].sort((a, b) => a.order - b.order);
    const target = index + direction;
    if (target < 0 || target >= opts.length) return;
    const a = opts[index];
    const b = opts[target];
    withBusy(a.id, async () => {
      await api(`/api/admin/find/options/${a.id}`, "PATCH", { order: b.order });
      await api(`/api/admin/find/options/${b.id}`, "PATCH", { order: a.order });
    });
  }

  function handleDeleteOption(option: FinderOptionRow) {
    if (!confirm(`Delete option "${option.label}"?`)) return;
    withBusy(option.id, () => api(`/api/admin/find/options/${option.id}`, "DELETE"));
  }

  async function handleCreateOption(question: FinderQuestionRow) {
    const label = (newOptionLabel[question.id] ?? "").trim();
    if (!label) return;
    setCreatingOptionFor(question.id);
    setError(null);
    try {
      await api("/api/admin/find/options", "POST", { questionId: question.id, label });
      setNewOptionLabel((prev) => ({ ...prev, [question.id]: "" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create option");
    } finally {
      setCreatingOptionFor(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-4">
        {sortedQuestions.map((question, index) => {
          const sortedOptions = [...question.options].sort((a, b) => a.order - b.order);
          return (
            <div key={question.id} className="flex flex-col gap-3 rounded border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 py-0"
                    disabled={index === 0 || busyId === question.id}
                    onClick={() => handleMoveQuestion(index, -1)}
                    aria-label="Move question up"
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 py-0"
                    disabled={index === sortedQuestions.length - 1 || busyId === question.id}
                    onClick={() => handleMoveQuestion(index, 1)}
                    aria-label="Move question down"
                  >
                    <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                </div>
                <Input
                  defaultValue={question.prompt}
                  className="max-w-md flex-1"
                  disabled={busyId === question.id}
                  onBlur={(e) => handleRenamePrompt(question, e.target.value)}
                />
                <span className="text-xs text-muted">
                  {question.status === "ACTIVE" ? "Active" : "Retired"}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyId === question.id}
                  onClick={() => handleToggleQuestionStatus(question)}
                >
                  {question.status === "ACTIVE" ? "Retire" : "Reactivate"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busyId === question.id}
                  onClick={() => handleDeleteQuestion(question)}
                >
                  Delete
                </Button>
              </div>

              <Input
                defaultValue={question.helpText ?? ""}
                placeholder="Help text shown under the prompt (optional)"
                disabled={busyId === question.id}
                onBlur={(e) => handleQuestionHelpTextChange(question, e.target.value)}
              />

              <div className="flex flex-col divide-y divide-border rounded border border-border pl-2">
                {sortedOptions.map((option, optIndex) => (
                  <div key={option.id} className="flex flex-col gap-2 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-4 px-1 py-0"
                          disabled={optIndex === 0 || busyId === option.id}
                          onClick={() => handleMoveOption(question, optIndex, -1)}
                          aria-label="Move option up"
                        >
                          <ArrowUp className="h-3 w-3" strokeWidth={1.5} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-4 px-1 py-0"
                          disabled={optIndex === sortedOptions.length - 1 || busyId === option.id}
                          onClick={() => handleMoveOption(question, optIndex, 1)}
                          aria-label="Move option down"
                        >
                          <ArrowDown className="h-3 w-3" strokeWidth={1.5} />
                        </Button>
                      </div>
                      <Input
                        defaultValue={option.label}
                        className="max-w-xs"
                        disabled={busyId === option.id}
                        onBlur={(e) => handleRenameOptionLabel(option, e.target.value)}
                      />
                      <span className="text-xs text-muted">
                        {option.status === "ACTIVE" ? "Active" : "Retired"}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busyId === option.id}
                        onClick={() => handleToggleOptionStatus(option)}
                      >
                        {option.status === "ACTIVE" ? "Retire" : "Reactivate"}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="ml-auto"
                        disabled={busyId === option.id}
                        onClick={() => handleDeleteOption(option)}
                      >
                        Delete
                      </Button>
                    </div>

                    {/* Live preview, not a saved field -- recomputed from tagSlugs/durationValues
                        on every render via the same pure assembly buildProgramsHref uses
                        server-side (lib/finderTargets.ts), so it can never drift from what
                        picking only this option would actually redirect to. */}
                    <p className="font-mono text-xs text-muted">
                      → {assembleProgramsHref(option.tagSlugs, option.durationValues)}
                    </p>

                    <Input
                      defaultValue={option.helpText ?? ""}
                      placeholder="Help text shown under this option (optional)"
                      className="max-w-md"
                      disabled={busyId === option.id}
                      onBlur={(e) => handleOptionHelpTextChange(option, e.target.value)}
                    />

                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted">Duration values this option contributes:</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {durationOptions.map((d) => (
                          <label key={d.value} className="flex items-center gap-2 text-xs text-foreground">
                            <input
                              type="checkbox"
                              checked={option.durationValues.includes(d.value)}
                              disabled={busyId === option.id}
                              onChange={() => handleToggleOptionDuration(option, d.value)}
                            />
                            {d.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted">Tags this option contributes:</span>
                      {[...tagsByCategory.entries()].map(([category, categoryTags]) => (
                        <div key={category} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="text-xs text-muted">{category}:</span>
                          {categoryTags.map((tag) => (
                            <label
                              key={tag.slug}
                              className="flex items-center gap-2 text-xs text-foreground"
                            >
                              <input
                                type="checkbox"
                                checked={option.tagSlugs.includes(tag.slug)}
                                disabled={busyId === option.id}
                                onChange={() => handleToggleOptionTag(option, tag.slug)}
                              />
                              {tag.name}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border p-2 pl-4">
                <Input
                  placeholder="New option label"
                  value={newOptionLabel[question.id] ?? ""}
                  onChange={(e) =>
                    setNewOptionLabel((prev) => ({ ...prev, [question.id]: e.target.value }))
                  }
                  className="max-w-56"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !(newOptionLabel[question.id] ?? "").trim() || creatingOptionFor === question.id
                  }
                  onClick={() => handleCreateOption(question)}
                >
                  {creatingOptionFor === question.id ? "Adding..." : "Add option"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border p-3">
        <Input
          placeholder="New question prompt, e.g. How long do you want to be in Israel?"
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
          className="max-w-md"
        />
        <Button
          type="button"
          size="sm"
          disabled={!newPrompt.trim() || creatingQuestion}
          onClick={handleCreateQuestion}
        >
          {creatingQuestion ? "Adding..." : "Add question"}
        </Button>
      </div>
    </div>
  );
}
