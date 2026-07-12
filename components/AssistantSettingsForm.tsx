"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";

export default function AssistantSettingsForm({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/assistant-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to update");
      setEnabled(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update assistant settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Program-finder assistant</h2>
      <p className="text-xs text-muted">
        A chat widget that helps visitors describe what they&rsquo;re looking for (e.g. &ldquo;something religious,
        3 months, focused on volunteering&rdquo;) and recommends matching programs. Admins always see it, regardless
        of this setting.
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="mt-1 flex items-center gap-3">
        <Button
          size="sm"
          variant={enabled ? "primary" : "secondary"}
          disabled={saving}
          onClick={() => handleToggle(!enabled)}
        >
          {saving ? "Saving..." : enabled ? "Visible to everyone" : "Admin-only"}
        </Button>
        <span className="text-xs text-muted">Click to {enabled ? "restrict to admins" : "show to all visitors"}.</span>
      </div>
    </div>
  );
}
