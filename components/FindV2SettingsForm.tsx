"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";

export default function FindV2SettingsForm({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/find-v2-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to update");
      setEnabled(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update /match settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Match flow (v2)</h2>
      <p className="text-xs text-muted">
        The weighted, video-argued question flow at /match -- a rebuilt version of /find that&rsquo;s still being
        content-authored (see /admin/flow/questions). /find (v1) stays live either way. Admins can always reach
        /match regardless of this setting, for testing before it&rsquo;s public.
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
