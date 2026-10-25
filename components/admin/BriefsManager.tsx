"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { countWords, previewText } from "@/lib/transcriptsShared";
import { buildCopyPayload } from "@/lib/briefsShared";

type SlugOption = { id: string; slug: string; name: string };

type BriefType = {
  id: string;
  name: string;
  slug: string;
  promptText: string;
  promptVersion: number;
  sendToAssistant: boolean;
  supersedesAiBrief: boolean;
  sortOrder: number;
  active: boolean;
};

type Brief = {
  id: string;
  briefTypeId: string;
  text: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  promptVersionUsed: number;
  needsRegeneration: boolean;
  insufficient: boolean;
  insufficientAt: string | null;
  updatedAt: string;
};

type TranscriptText = { filename: string; text: string };

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

function BriefEditor({
  programId,
  briefType,
  brief,
  transcripts,
  onChanged,
}: {
  programId: string;
  briefType: BriefType;
  brief: Brief | null;
  transcripts: TranscriptText[];
  onChanged: () => void;
}) {
  // No effect syncing text/lastInsufficient from `brief` -- the parent remounts this
  // component (via a key including brief?.id/updatedAt) whenever the underlying brief
  // actually changes, so these useState initializers re-run from fresh props instead.
  const [text, setText] = useState(brief?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInsufficient, setLastInsufficient] = useState(brief?.insufficient ?? false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildCopyPayload(briefType.promptText, transcripts));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  }

  async function handleSaveDraft() {
    setBusy(true);
    setError(null);
    try {
      const result = await api("/api/admin/briefs", "POST", { programId, briefTypeId: briefType.id, text });
      setLastInsufficient(result.insufficient);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      const result = await api("/api/admin/briefs/generate", "POST", { programId, briefTypeId: briefType.id });
      setText(result.brief.text);
      setLastInsufficient(result.insufficient);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate a brief");
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    if (!brief) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/briefs/${brief.id}/publish`, "POST");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!brief) return;
    if (!confirm(`Archive the "${briefType.name}" brief for this program?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/briefs/${brief.id}/archive`, "POST");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setBusy(false);
    }
  }

  const stale = brief && brief.promptVersionUsed < briefType.promptVersion;
  const canPublish = brief && !lastInsufficient && text.trim().length > 0 && brief.status !== "PUBLISHED";

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{briefType.name}</span>
        {brief?.status === "PUBLISHED" && <Badge tone="success">Published</Badge>}
        {brief?.status === "DRAFT" && <Badge>Draft</Badge>}
        {brief?.needsRegeneration && <Badge tone="warning">Needs regeneration — new transcript uploaded</Badge>}
        {lastInsufficient && <Badge tone="danger">Insufficient — transcripts don&rsquo;t cover this yet</Badge>}
        {stale && (
          <Badge tone="warning">
            Prompt v{brief!.promptVersionUsed} (current v{briefType.promptVersion})
          </Badge>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy prompt + transcripts"}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={busy || transcripts.length === 0} onClick={handleGenerate}>
            {busy ? "Working..." : "Generate"}
          </Button>
        </div>
      </div>

      <Textarea
        aria-label={`${briefType.name} brief text`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Paste the drafted brief here, or press Generate"
      />

      {error && <p className="rounded bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={handleSaveDraft}>
          {busy ? "Saving..." : "Save as draft"}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy || !canPublish} onClick={handlePublish}>
          Publish
        </Button>
        {brief && brief.status !== "ARCHIVED" && (
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={handleArchive}>
            Archive
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function BriefsManager({ programs }: { programs: SlugOption[] }) {
  const [programId, setProgramId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptText[]>([]);
  const [briefs, setBriefs] = useState<{ briefType: BriefType; brief: Brief | null }[]>([]);

  async function load(id: string) {
    if (!id) {
      setTranscripts([]);
      setBriefs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api(`/api/admin/briefs?programId=${id}`, "GET");
      setTranscripts(data.transcripts);
      setBriefs(data.briefs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // No effect watching programId -- the only thing that ever changes it is the Select's
  // own onChange below, so the load is triggered directly from that user event instead
  // of from an effect reacting to the resulting state change.
  function handleProgramChange(id: string) {
    setProgramId(id);
    load(id);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Program
          <Select value={programId} onChange={(e) => handleProgramChange(e.target.value)}>
            <option value="">Select a program…</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      </Card>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {error && <p className="rounded bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

      {programId && !loading && (
        <>
          <Card className="flex flex-col gap-2 p-4">
            <p className="text-sm font-semibold text-foreground">
              Transcripts ({transcripts.length})
            </p>
            {transcripts.length === 0 ? (
              <p className="text-xs text-muted">
                No transcripts yet — upload some at{" "}
                <a href="/admin/transcripts" className="text-accent-hover underline">
                  /admin/transcripts
                </a>
                .
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded border border-border">
                {transcripts.map((t) => (
                  <div key={t.filename} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <span className="font-mono text-foreground">{t.filename}</span>
                    <span className="text-muted">{countWords(t.text)} words</span>
                    <span className="text-muted">{previewText(t.text, 100)}…</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {briefs.map(({ briefType, brief }) => (
            <BriefEditor
              key={`${briefType.id}-${brief?.id ?? "none"}-${brief?.updatedAt ?? "none"}`}
              programId={programId}
              briefType={briefType}
              brief={brief}
              transcripts={transcripts}
              onChanged={() => load(programId)}
            />
          ))}
        </>
      )}
    </div>
  );
}
