"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { resolveReferenceVisibility, type ReferenceVisibility } from "@/lib/referenceVisibility";

const OPTIONS: { value: ReferenceVisibility; label: string }[] = [
  { value: "AUTO", label: "Auto (unlock at threshold)" },
  { value: "FORCE_SHOW", label: "Force show" },
  { value: "FORCE_HIDE", label: "Force hide" },
];

export default function ReferenceVisibilityControl({
  programId,
  approvedCount,
  visibility,
  unlockedAt,
  minToShow,
}: {
  programId: string;
  approvedCount: number;
  visibility: ReferenceVisibility;
  unlockedAt: Date | null;
  minToShow: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = useState(visibility);
  const [saving, setSaving] = useState(false);

  const currentlyShowing = resolveReferenceVisibility(approvedCount, { visibility: value, unlockedAt, minToShow });

  async function handleChange(next: ReferenceVisibility) {
    setValue(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/programs/${programId}/reference-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save");
      }
      toast("Visibility updated");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save");
      setValue(visibility);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <select
        value={value}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value as ReferenceVisibility)}
        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className="text-muted">
        {approvedCount} approved · {currentlyShowing ? "showing" : "hidden"}
        {unlockedAt ? " · unlocked" : ""}
      </span>
    </div>
  );
}
