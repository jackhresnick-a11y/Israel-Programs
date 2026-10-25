"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button, { buttonVariants } from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import Badge from "@/components/ui/Badge";
import { matchFilesToSlugs, type MatchedFile, type UnmatchedFile, type SlugOption } from "@/lib/transcriptsShared";

export type TranscriptRow = {
  id: string;
  filename: string;
  sourceUrl: string | null;
  wordCount: number;
  preview: string;
  createdAt: Date;
};

export type ProgramTranscriptGroup = {
  programId: string;
  slug: string;
  name: string;
  transcripts: TranscriptRow[];
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

function TranscriptRowItem({ transcript }: { transcript: TranscriptRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openEdit() {
    setEditing(true);
    setError(null);
    if (text === null) {
      setLoading(true);
      try {
        const data = await api(`/api/admin/transcripts/${transcript.id}`, "GET");
        setText(data.text ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load transcript");
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleSave() {
    if (text === null) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/transcripts/${transcript.id}`, "PATCH", { text });
      router.refresh();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete transcript "${transcript.filename}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/transcripts/${transcript.id}`, "DELETE");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-foreground">{transcript.filename}</span>
        <span className="text-xs text-muted">{transcript.wordCount} words</span>
        {transcript.sourceUrl && (
          <a
            href={transcript.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent underline"
          >
            source
          </a>
        )}
        <span className="ml-auto text-xs text-muted">
          Added {new Date(transcript.createdAt).toLocaleDateString()}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={openEdit}>
          {editing ? "Editing" : "Edit"}
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={handleDelete}>
          Delete
        </Button>
      </div>

      {!editing && (
        <p className="text-xs text-muted">
          {transcript.preview}
          {transcript.preview.length >= 200 ? "…" : ""}
        </p>
      )}

      {error && <p className="rounded bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

      {editing && (
        <div className="flex flex-col gap-2">
          {loading ? (
            <p className="text-xs text-muted">Loading...</p>
          ) : (
            <Textarea value={text ?? ""} onChange={(e) => setText(e.target.value)} rows={10} />
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy || loading} onClick={handleSave}>
              {busy ? "Saving..." : "Save"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgramTranscriptGroupItem({ group }: { group: ProgramTranscriptGroup }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 bg-surface-muted px-4 py-2">
        <span className="text-sm font-medium text-foreground">{group.name}</span>
        <span className="font-mono text-xs text-muted">{group.slug}</span>
        <span className="text-xs text-muted">
          {group.transcripts.length} transcript{group.transcripts.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {group.transcripts.map((t) => (
          <TranscriptRowItem key={t.id} transcript={t} />
        ))}
      </div>
    </div>
  );
}

export default function TranscriptsManager({
  initialTranscripts,
  slugOptions,
}: {
  initialTranscripts: ProgramTranscriptGroup[];
  slugOptions: SlugOption[];
}) {
  const router = useRouter();

  const [matched, setMatched] = useState<MatchedFile[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedFile[]>([]);
  const [sourceUrls, setSourceUrls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const existingCountBySlug = useMemo(
    () => new Map(initialTranscripts.map((g) => [g.slug, g.transcripts.length])),
    [initialTranscripts]
  );

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);
    setSaveSuccess(null);

    try {
      const files = await Promise.all(
        Array.from(fileList).map(async (f) => ({ filename: f.name, text: await f.text() }))
      );
      const { matched: m, unmatched: u } = matchFilesToSlugs(files, slugOptions, existingCountBySlug);
      setMatched(m);
      setUnmatched(u);
      setSourceUrls({});
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to read files");
    }
  }

  async function handleSave() {
    if (matched.length === 0) return;
    setSaving(true);
    setUploadError(null);
    try {
      const result = await api("/api/admin/transcripts", "POST", {
        entries: matched.map((m) => ({
          slug: m.slug,
          filename: m.filename,
          text: m.text,
          sourceUrl: sourceUrls[m.filename]?.trim() || undefined,
        })),
      });
      setSaveSuccess(`Saved ${result.saved} transcript${result.saved === 1 ? "" : "s"}.`);
      setMatched([]);
      setUnmatched([]);
      setSourceUrls({});
      router.refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold text-foreground">1. Download the slug list</p>
        <p className="text-xs text-muted">
          Save this as scripts/transcribe/slugs.json for the local transcription script to read.
        </p>
        <a
          href="/api/admin/transcripts/slugs"
          download
          className={buttonVariants({ variant: "secondary", size: "sm", className: "self-start" })}
        >
          Download slug list
        </a>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold text-foreground">2. Upload transcript .txt files</p>
        <p className="text-xs text-muted">
          Matched by exact program slug (filename minus .txt, and minus a &ldquo;--...&rdquo; suffix -- so
          &ldquo;aish-hatorah--1.txt&rdquo; and &ldquo;aish-hatorah--2.txt&rdquo; both attach to
          &ldquo;aish-hatorah&rdquo;). Nothing is guessed, and nothing is ever overwritten -- every upload
          adds a new transcript.
        </p>
        <input
          type="file"
          multiple
          accept=".txt,text/plain"
          onChange={(e) => handleFiles(e.target.files)}
          className="text-xs text-foreground"
        />

        {uploadError && <p className="rounded bg-danger-bg px-3 py-2 text-xs text-danger">{uploadError}</p>}
        {saveSuccess && <p className="rounded bg-success-bg px-3 py-2 text-xs text-success">{saveSuccess}</p>}

        {matched.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Slug</th>
                    <th className="px-3 py-2 font-semibold">Program</th>
                    <th className="px-3 py-2 font-semibold">Words</th>
                    <th className="px-3 py-2 font-semibold">Preview</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Source URL (optional)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matched.map((m) => (
                    <tr key={m.filename}>
                      <td className="px-3 py-2 font-mono text-foreground">{m.slug}</td>
                      <td className="px-3 py-2 text-foreground">{m.programName}</td>
                      <td className="px-3 py-2 text-muted">{m.wordCount}</td>
                      <td className="px-3 py-2 text-muted">
                        {m.preview}
                        {m.preview.length >= 200 ? "…" : ""}
                      </td>
                      <td className="px-3 py-2">
                        {m.existingCount > 0 ? (
                          <Badge tone="warning">Adds to {m.existingCount} existing</Badge>
                        ) : (
                          <Badge tone="success">New</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="url"
                          placeholder="https://..."
                          value={sourceUrls[m.filename] ?? ""}
                          onChange={(e) => setSourceUrls((prev) => ({ ...prev, [m.filename]: e.target.value }))}
                          className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button type="button" size="sm" className="self-start" disabled={saving} onClick={handleSave}>
              {saving ? "Saving..." : `Save ${matched.length} transcript${matched.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        )}

        {unmatched.length > 0 && (
          <div className="flex flex-col gap-1 rounded border border-border bg-surface-muted p-3">
            <p className="text-xs font-semibold text-muted">
              Unmatched ({unmatched.length}) — no program has this exact slug
            </p>
            {unmatched.map((u) => (
              <p key={u.filename} className="font-mono text-xs text-muted">
                {u.filename}
              </p>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold text-foreground">
          Existing transcripts ({initialTranscripts.reduce((n, g) => n + g.transcripts.length, 0)})
        </p>
        <div className="flex flex-col divide-y divide-border rounded border border-border">
          {initialTranscripts.map((g) => (
            <ProgramTranscriptGroupItem key={g.programId} group={g} />
          ))}
          {initialTranscripts.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">No transcripts saved yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
