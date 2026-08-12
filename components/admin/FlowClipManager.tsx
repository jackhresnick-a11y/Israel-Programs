"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

export type FlowVideoRow = {
  id: string;
  key: string;
  title: string;
  provider: string;
  embedUrl: string;
  watchUrl: string;
  posterUrl: string | null;
  transcript: string | null;
  notes: string | null;
  speaker: string | null;
  durationSeconds: number | null;
  status: "ACTIVE" | "RETIRED";
};

export type FlowVideoTriggerRow = {
  id: string;
  videoId: string;
  questionId: string;
  mode: "ON_DISPLAY" | "ON_ANSWER";
  optionKeys: string[];
  when: unknown;
  rolloutPercent: number;
  order: number;
  status: "ACTIVE" | "RETIRED";
};

export type QuestionOption = { id: string; key: string; prompt: string };

const MODES = ["ON_DISPLAY", "ON_ANSWER"] as const;

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

function parseRuleText(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, error: "Not valid JSON" };
  }
}

function jsonText(value: unknown): string {
  return value == null ? "" : JSON.stringify(value, null, 2);
}

/**
 * Admin CRUD for /match's clips (find-v2-question-spec.md: "the video is
 * conditional, not the question"). Paste-a-link only -- see lib/flow.ts's
 * createFlowVideo. Each clip owns zero-or-more triggers (which question + which
 * answer, or "on display", fires it); triggers are edited inline under their
 * video, same nested-list shape as FlowQuestionsManager's options-under-questions.
 */
export default function FlowClipManager({
  videos,
  triggers,
  questions,
}: {
  videos: FlowVideoRow[];
  triggers: FlowVideoTriggerRow[];
  questions: QuestionOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ruleErrors, setRuleErrors] = useState<Record<string, string>>({});

  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [newVideoTitle, setNewVideoTitle] = useState("");
  const [creatingVideo, setCreatingVideo] = useState(false);

  const [newTriggerFields, setNewTriggerFields] = useState<
    Record<string, { questionId: string; mode: "ON_DISPLAY" | "ON_ANSWER"; optionKeys: string; when: string; rolloutPercent: string }>
  >({});
  const [creatingTriggerFor, setCreatingTriggerFor] = useState<string | null>(null);

  const questionById = new Map(questions.map((q) => [q.id, q]));

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

  function setRuleError(fieldId: string, message: string | null) {
    setRuleErrors((prev) => {
      const next = { ...prev };
      if (message) next[fieldId] = message;
      else delete next[fieldId];
      return next;
    });
  }

  async function handleCreateVideo() {
    if (!newVideoUrl.trim() || !newVideoTitle.trim()) return;
    setCreatingVideo(true);
    setError(null);
    try {
      await api("/api/admin/flow/clips", "POST", { videoUrl: newVideoUrl, title: newVideoTitle });
      setNewVideoUrl("");
      setNewVideoTitle("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add clip");
    } finally {
      setCreatingVideo(false);
    }
  }

  function handleVideoUrlChange(video: FlowVideoRow, videoUrl: string) {
    if (!videoUrl.trim() || videoUrl === video.embedUrl || videoUrl === video.watchUrl) return;
    withBusy(video.id, () => api(`/api/admin/flow/clips/${video.id}`, "PATCH", { videoUrl }));
  }

  function handleTitleChange(video: FlowVideoRow, title: string) {
    if (!title.trim() || title === video.title) return;
    withBusy(video.id, () => api(`/api/admin/flow/clips/${video.id}`, "PATCH", { title }));
  }

  function handleTextFieldChange(video: FlowVideoRow, field: "transcript" | "notes" | "speaker", value: string) {
    const next = value.trim() || null;
    if (next === video[field]) return;
    withBusy(video.id, () => api(`/api/admin/flow/clips/${video.id}`, "PATCH", { [field]: next }));
  }

  function handleDurationChange(video: FlowVideoRow, text: string) {
    const value = text.trim() ? Number.parseInt(text, 10) : null;
    if (Number.isNaN(value) || value === video.durationSeconds) return;
    withBusy(video.id, () => api(`/api/admin/flow/clips/${video.id}`, "PATCH", { durationSeconds: value }));
  }

  function handleToggleVideoStatus(video: FlowVideoRow) {
    const next = video.status === "ACTIVE" ? "RETIRED" : "ACTIVE";
    withBusy(video.id, () => api(`/api/admin/flow/clips/${video.id}`, "PATCH", { status: next }));
  }

  function handleWhenChange(trigger: FlowVideoTriggerRow, text: string) {
    const fieldId = `when:${trigger.id}`;
    const parsed = parseRuleText(text);
    if (!parsed.ok) {
      setRuleError(fieldId, parsed.error);
      return;
    }
    setRuleError(fieldId, null);
    if (JSON.stringify(parsed.value) === JSON.stringify(trigger.when ?? null)) return;
    withBusy(trigger.id, () => api(`/api/admin/flow/clips/triggers/${trigger.id}`, "PATCH", { when: parsed.value }));
  }

  function handleRolloutChange(trigger: FlowVideoTriggerRow, text: string) {
    const value = Number.parseInt(text, 10);
    if (Number.isNaN(value) || value === trigger.rolloutPercent) return;
    withBusy(trigger.id, () => api(`/api/admin/flow/clips/triggers/${trigger.id}`, "PATCH", { rolloutPercent: value }));
  }

  function handleToggleTriggerStatus(trigger: FlowVideoTriggerRow) {
    const next = trigger.status === "ACTIVE" ? "RETIRED" : "ACTIVE";
    withBusy(trigger.id, () => api(`/api/admin/flow/clips/triggers/${trigger.id}`, "PATCH", { status: next }));
  }

  function handleDeleteTrigger(trigger: FlowVideoTriggerRow) {
    if (!confirm("Delete this trigger?")) return;
    withBusy(trigger.id, () => api(`/api/admin/flow/clips/triggers/${trigger.id}`, "DELETE"));
  }

  async function handleCreateTrigger(video: FlowVideoRow) {
    const fields = newTriggerFields[video.id];
    if (!fields?.questionId) return;
    const parsedWhen = parseRuleText(fields.when ?? "");
    if (!parsedWhen.ok) {
      setError(`Trigger condition: ${parsedWhen.error}`);
      return;
    }
    setCreatingTriggerFor(video.id);
    setError(null);
    try {
      await api("/api/admin/flow/clips/triggers", "POST", {
        videoId: video.id,
        questionId: fields.questionId,
        mode: fields.mode,
        optionKeys: fields.optionKeys
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        when: parsedWhen.value,
        rolloutPercent: fields.rolloutPercent.trim() ? Number.parseInt(fields.rolloutPercent, 10) : 100,
      });
      setNewTriggerFields((prev) => ({ ...prev, [video.id]: { questionId: "", mode: "ON_ANSWER", optionKeys: "", when: "", rolloutPercent: "" } }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trigger");
    } finally {
      setCreatingTriggerFor(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-4">
        {videos.map((video) => {
          const videoTriggers = triggers.filter((t) => t.videoId === video.id).sort((a, b) => a.order - b.order);
          const triggerFields = newTriggerFields[video.id] ?? {
            questionId: "",
            mode: "ON_ANSWER" as const,
            optionKeys: "",
            when: "",
            rolloutPercent: "",
          };

          return (
            <div key={video.id} className="flex flex-col gap-3 rounded border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  defaultValue={video.title}
                  className="max-w-md flex-1"
                  disabled={busyId === video.id}
                  onBlur={(e) => handleTitleChange(video, e.target.value)}
                />
                <Badge tone="neutral">{video.provider}</Badge>
                <span className="text-xs text-muted">{video.status === "ACTIVE" ? "Active" : "Retired"}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyId === video.id}
                  onClick={() => handleToggleVideoStatus(video)}
                >
                  {video.status === "ACTIVE" ? "Retire" : "Reactivate"}
                </Button>
              </div>

              <p className="font-mono text-xs text-muted">key: {video.key}</p>

              {video.posterUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={video.posterUrl} alt="" className="h-24 w-auto rounded border border-border object-cover" />
              )}

              <Input
                defaultValue={video.watchUrl}
                placeholder="Paste a new YouTube/Vimeo link to re-film this clip"
                disabled={busyId === video.id}
                onBlur={(e) => handleVideoUrlChange(video, e.target.value)}
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  defaultValue={video.speaker ?? ""}
                  placeholder="Speaker (e.g. 'Lone soldier, Golani')"
                  disabled={busyId === video.id}
                  onBlur={(e) => handleTextFieldChange(video, "speaker", e.target.value)}
                />
                <Input
                  type="number"
                  defaultValue={video.durationSeconds ?? ""}
                  placeholder="Duration (seconds)"
                  disabled={busyId === video.id}
                  onBlur={(e) => handleDurationChange(video, e.target.value)}
                />
              </div>
              <Textarea
                defaultValue={video.transcript ?? ""}
                placeholder="Transcript -- what the flow shows if the clip fails to load or won't play"
                className="min-h-16 text-xs"
                disabled={busyId === video.id}
                onBlur={(e) => handleTextFieldChange(video, "transcript", e.target.value)}
              />
              <Textarea
                defaultValue={video.notes ?? ""}
                placeholder="Production notes (admin-only)"
                className="min-h-12 text-xs"
                disabled={busyId === video.id}
                onBlur={(e) => handleTextFieldChange(video, "notes", e.target.value)}
              />

              <div className="flex flex-col divide-y divide-border rounded border border-border pl-2">
                {videoTriggers.map((trigger) => {
                  const question = questionById.get(trigger.questionId);
                  const whenError = ruleErrors[`when:${trigger.id}`];
                  return (
                    <div key={trigger.id} className="flex flex-col gap-2 px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-foreground">{question?.prompt ?? trigger.questionId}</span>
                        <Badge tone="info">{trigger.mode}</Badge>
                        {trigger.optionKeys.length > 0 && (
                          <span className="font-mono text-xs text-muted">[{trigger.optionKeys.join(", ")}]</span>
                        )}
                        <span className="text-xs text-muted">
                          {trigger.status === "ACTIVE" ? "Active" : "Retired"}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busyId === trigger.id}
                          onClick={() => handleToggleTriggerStatus(trigger)}
                        >
                          {trigger.status === "ACTIVE" ? "Retire" : "Reactivate"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="ml-auto"
                          disabled={busyId === trigger.id}
                          onClick={() => handleDeleteTrigger(trigger)}
                        >
                          Delete
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-xs text-foreground">
                          Rollout %
                          <Input
                            type="number"
                            defaultValue={trigger.rolloutPercent}
                            className="w-20"
                            disabled={busyId === trigger.id}
                            onBlur={(e) => handleRolloutChange(trigger, e.target.value)}
                          />
                        </label>
                      </div>
                      <Textarea
                        defaultValue={jsonText(trigger.when)}
                        placeholder="Extra show-condition (JSON, empty = always eligible)"
                        className="min-h-12 font-mono text-xs"
                        disabled={busyId === trigger.id}
                        onBlur={(e) => handleWhenChange(trigger, e.target.value)}
                      />
                      {whenError && <p className="text-xs text-danger">{whenError}</p>}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 rounded border border-dashed border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={triggerFields.questionId}
                    onChange={(e) =>
                      setNewTriggerFields((prev) => ({ ...prev, [video.id]: { ...triggerFields, questionId: e.target.value } }))
                    }
                    className="w-auto"
                  >
                    <option value="">Which question?</option>
                    {questions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.prompt}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={triggerFields.mode}
                    onChange={(e) =>
                      setNewTriggerFields((prev) => ({
                        ...prev,
                        [video.id]: { ...triggerFields, mode: e.target.value as "ON_DISPLAY" | "ON_ANSWER" },
                      }))
                    }
                    className="w-auto"
                  >
                    {MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                  <Input
                    placeholder="Option keys, comma-separated (ON_ANSWER only)"
                    value={triggerFields.optionKeys}
                    onChange={(e) =>
                      setNewTriggerFields((prev) => ({ ...prev, [video.id]: { ...triggerFields, optionKeys: e.target.value } }))
                    }
                    className="max-w-56"
                  />
                  <Input
                    type="number"
                    placeholder="Rollout % (default 100)"
                    value={triggerFields.rolloutPercent}
                    onChange={(e) =>
                      setNewTriggerFields((prev) => ({ ...prev, [video.id]: { ...triggerFields, rolloutPercent: e.target.value } }))
                    }
                    className="w-40"
                  />
                </div>
                <Textarea
                  placeholder='Extra condition (JSON, optional), e.g. {"v":1,"when":{"type":"answerIn","questionKey":"program-gender","optionKeys":["boys-only"]}}'
                  value={triggerFields.when}
                  onChange={(e) =>
                    setNewTriggerFields((prev) => ({ ...prev, [video.id]: { ...triggerFields, when: e.target.value } }))
                  }
                  className="min-h-12 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  className="self-start"
                  disabled={!triggerFields.questionId || creatingTriggerFor === video.id}
                  onClick={() => handleCreateTrigger(video)}
                >
                  {creatingTriggerFor === video.id ? "Adding..." : "Add trigger"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border p-3">
        <Input
          placeholder="YouTube or Vimeo link"
          value={newVideoUrl}
          onChange={(e) => setNewVideoUrl(e.target.value)}
          className="max-w-md"
        />
        <Input
          placeholder="Clip title (admin-only)"
          value={newVideoTitle}
          onChange={(e) => setNewVideoTitle(e.target.value)}
          className="max-w-56"
        />
        <Button
          type="button"
          size="sm"
          disabled={!newVideoUrl.trim() || !newVideoTitle.trim() || creatingVideo}
          onClick={handleCreateVideo}
        >
          {creatingVideo ? "Adding..." : "Add clip"}
        </Button>
      </div>
    </div>
  );
}
