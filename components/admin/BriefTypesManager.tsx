"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";

export type BriefTypeRow = {
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

function BriefTypeRowItem({ briefType }: { briefType: BriefTypeRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(briefType.name);
  const [promptText, setPromptText] = useState(briefType.promptText);
  const [sendToAssistant, setSendToAssistant] = useState(briefType.sendToAssistant);
  const [supersedesAiBrief, setSupersedesAiBrief] = useState(briefType.supersedesAiBrief);
  const [sortOrder, setSortOrder] = useState(String(briefType.sortOrder));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function handleSave() {
    withBusy(async () => {
      await api(`/api/admin/brief-types/${briefType.id}`, "PATCH", {
        name,
        promptText,
        sendToAssistant,
        supersedesAiBrief,
        sortOrder: Number(sortOrder) || 0,
      });
      setEditing(false);
    });
  }

  function handleToggleActive() {
    withBusy(() => api(`/api/admin/brief-types/${briefType.id}`, "PATCH", { active: !briefType.active }));
  }

  function handleDelete() {
    if (!confirm(`Delete brief type "${briefType.name}"? Only possible if it has no briefs.`)) return;
    withBusy(() => api(`/api/admin/brief-types/${briefType.id}`, "DELETE"));
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{briefType.name}</span>
        <span className="font-mono text-xs text-muted">{briefType.slug}</span>
        <span className="text-xs text-muted">prompt v{briefType.promptVersion}</span>
        {briefType.sendToAssistant && <Badge tone="success">Sent to assistant</Badge>}
        {briefType.supersedesAiBrief && <Badge tone="warning">Supersedes AI brief</Badge>}
        {!briefType.active && <Badge tone="warning">Inactive</Badge>}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing((e) => !e)}>
            {editing ? "Cancel" : "Edit"}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={handleToggleActive}>
            {briefType.active ? "Deactivate" : "Activate"}
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      {error && <p className="rounded bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

      {editing && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Prompt text
            <Textarea value={promptText} onChange={(e) => setPromptText(e.target.value)} rows={6} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Sort order
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-24"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={sendToAssistant}
              onChange={(e) => setSendToAssistant(e.target.checked)}
              className="accent-accent"
            />
            Send PUBLISHED briefs of this type to the assistant
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={supersedesAiBrief}
              onChange={(e) => setSupersedesAiBrief(e.target.checked)}
              className="accent-accent"
            />
            A PUBLISHED brief of this type replaces the legacy AI brief (assistant + public JSON API)
          </label>
          <Button type="button" size="sm" className="self-start" disabled={busy} onClick={handleSave}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function BriefTypesManager({ briefTypes }: { briefTypes: BriefTypeRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [promptText, setPromptText] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      await api("/api/admin/brief-types", "POST", {
        name,
        slug,
        promptText: promptText || "TODO: paste the real prompt for this brief type.",
        sortOrder: briefTypes.length,
      });
      setName("");
      setSlug("");
      setPromptText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create brief type");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold text-foreground">New brief type</p>
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="A day in the life" />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
            Slug
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="a-day-in-the-life" />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Prompt text (can be edited later)
          <Textarea value={promptText} onChange={(e) => setPromptText(e.target.value)} rows={4} />
        </label>
        {error && <p className="rounded bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={creating || !name.trim() || !slug.trim()}
          onClick={handleCreate}
        >
          {creating ? "Creating..." : "Create"}
        </Button>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold text-foreground">Brief types ({briefTypes.length})</p>
        <div className="flex flex-col divide-y divide-border rounded border border-border">
          {briefTypes.map((bt) => (
            <BriefTypeRowItem key={bt.id} briefType={bt} />
          ))}
          {briefTypes.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">No brief types yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
