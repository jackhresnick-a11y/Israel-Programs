"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import type { ElaborationPrompt, ElaborationPromptsConfig } from "@/lib/pollElaborationPromptsConfig";

function newPrompt(): ElaborationPrompt {
  const key = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `prompt-${Date.now()}`;
  return { key, text: "", enabled: true };
}

/**
 * Admin editor for the end-of-poll elaboration block's four (or however many) prompts --
 * one SiteContent("pollElaborationPrompts") JSON blob, saved whole on Save, same
 * single-PATCH-on-save pattern as PartnerLinksManager.tsx (no per-item API calls). A
 * prompt's `key` is its stable identity (what PollElaborationAnswer.promptKey
 * references) and is never editable here -- rewording `text` is safe at any time since
 * every existing answer snapshots its own `promptText`, but changing `key` would orphan
 * that soft reference. Reordering only affects display order (the chooser and the
 * public program-page grouping both read this same order); it does not renumber or
 * reassign any existing answer.
 */
export default function ElaborationPromptManager({ initialConfig }: { initialConfig: ElaborationPromptsConfig }) {
  const router = useRouter();
  const [prompts, setPrompts] = useState<ElaborationPrompt[]>(initialConfig.prompts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function updatePrompt(key: string, patch: Partial<ElaborationPrompt>) {
    setPrompts((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
    setSavedAt(null);
  }

  function removePrompt(key: string) {
    setPrompts((prev) => prev.filter((p) => p.key !== key));
    setSavedAt(null);
  }

  function addPrompt() {
    setPrompts((prev) => [...prev, newPrompt()]);
    setSavedAt(null);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= prompts.length) return;
    setPrompts((prev) => {
      const reordered = [...prev];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
    setSavedAt(null);
  }

  const anyTextEmpty = prompts.some((p) => p.text.trim().length === 0);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/polls/elaboration-prompts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ v: 1, prompts }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save prompts");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      {prompts.length === 0 && (
        <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted">
          No prompts configured — the elaboration block won&rsquo;t render until at least one is added.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {prompts.map((prompt, i) => (
          <div key={prompt.key} className="flex flex-col gap-3 rounded border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="secondary" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={i === prompts.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={prompt.enabled ? "primary" : "secondary"}
                  onClick={() => updatePrompt(prompt.key, { enabled: !prompt.enabled })}
                >
                  {prompt.enabled ? "Enabled" : "Disabled"}
                </Button>
              </div>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => removePrompt(prompt.key)}
                aria-label="Remove prompt"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Prompt text</span>
              <Textarea
                value={prompt.text}
                maxLength={300}
                rows={2}
                onChange={(e) => updatePrompt(prompt.key, { text: e.target.value })}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={addPrompt}>
          Add prompt
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving || anyTextEmpty}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {anyTextEmpty && <span className="text-xs text-danger">Every prompt needs text before saving.</span>}
        {savedAt && <span className="text-xs text-muted">Saved.</span>}
      </div>
    </div>
  );
}
