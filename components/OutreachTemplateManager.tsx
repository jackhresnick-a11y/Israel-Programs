"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";

export type OutreachTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

const EMPTY_FORM = { name: "", subject: "", body: "" };

async function postJson(url: string, method: string, body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export default function OutreachTemplateManager({ templates }: { templates: OutreachTemplate[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);

  function startCreate() {
    setEditingId("new");
    setForm(EMPTY_FORM);
  }

  function startEdit(template: OutreachTemplate) {
    setEditingId(template.id);
    setForm({ name: template.name, subject: template.subject, body: template.body });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!editingId) return;
    setBusy("save");
    try {
      if (editingId === "new") {
        await postJson("/api/admin/outreach/saved-templates", "POST", form);
        toast("Template created");
      } else {
        await postJson(`/api/admin/outreach/saved-templates/${editingId}`, "PATCH", form);
        toast("Template updated");
      }
      cancelEdit();
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(template: OutreachTemplate) {
    if (!window.confirm(`Delete the "${template.name}" template? This can't be undone.`)) return;
    setBusy(template.id);
    try {
      await postJson(`/api/admin/outreach/saved-templates/${template.id}`, "DELETE", {});
      toast("Template deleted");
      if (editingId === template.id) cancelEdit();
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete template");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <p className="text-xs text-muted">
          Merge fields: <code>{"{contactName|\"there\"}"}</code>, <code>{"{programName}"}</code>,{" "}
          <code>{"{listingUrl}"}</code>, <code>{"{programDescriptor}"}</code> (built only from duration + location --
          e.g. &ldquo;your gap year program in Jerusalem&rdquo;). Save as many templates as you like, then pick one
          when generating drafts on the Outreach tab.
        </p>
        {editingId ? (
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium text-muted">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Gap Year v2"
            />
            <label className="text-xs font-medium text-muted">Subject</label>
            <Input
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            />
            <label className="text-xs font-medium text-muted">Body</label>
            <Textarea
              rows={8}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={busy === "save" || !form.name || !form.subject || !form.body}>
                {busy === "save" ? "Saving..." : editingId === "new" ? "Create template" : "Save changes"}
              </Button>
              <Button size="sm" variant="secondary" onClick={cancelEdit} disabled={busy === "save"}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button size="sm" onClick={startCreate}>
              + New template
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Saved templates ({templates.length})</h2>
        {templates.length === 0 ? (
          <p className="text-sm text-muted">No saved templates yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {templates.map((template) => (
              <div key={template.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-foreground">{template.name}</span>
                  <span className="text-sm text-muted">{template.subject}</span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="secondary" onClick={() => startEdit(template)} disabled={busy !== null}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(template)}
                    disabled={busy !== null}
                  >
                    {busy === template.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
