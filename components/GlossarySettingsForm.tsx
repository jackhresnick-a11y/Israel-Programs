"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/** The one place the glossaryEnabled toggle lives, rendered at the top of
 * /admin/glossary. Same shape as FindV2SettingsForm.tsx (/match's equivalent
 * kill switch). */
export default function GlossarySettingsForm({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/glossary-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to update");
      setEnabled(next);
      toast(next ? "Glossary is now visible to everyone" : "Glossary is now admin-only");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update glossary settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Glossary visibility</h2>
      <p className="text-xs text-muted">
        Whether /glossary and every /glossary/[slug] page are reachable by non-admin visitors. Off by
        default until the real definitions replace the placeholder copy. Admins can always reach the
        glossary regardless of this setting.
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
