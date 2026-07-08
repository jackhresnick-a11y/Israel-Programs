"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import type { FilterDropdownTint } from "@/components/ui/FilterDropdown";

export type TagCategoryRow = {
  id: string;
  slug: string;
  label: string;
  order: number;
  tint: string;
  showInFilter: boolean;
};

const TINT_OPTIONS: FilterDropdownTint[] = ["accent", "info", "success", "warning", "danger", "violet"];

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

export default function TagCategoryManager({ categories }: { categories: TagCategoryRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newTint, setNewTint] = useState<FilterDropdownTint>("accent");
  const [creating, setCreating] = useState(false);

  const sorted = [...categories].sort((a, b) => a.order - b.order);

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

  function handleRename(category: TagCategoryRow, label: string) {
    if (!label.trim() || label === category.label) return;
    withBusy(category.id, () => api(`/api/admin/tag-categories/${category.id}`, "PATCH", { label }));
  }

  function handleTintChange(category: TagCategoryRow, tint: string) {
    withBusy(category.id, () => api(`/api/admin/tag-categories/${category.id}`, "PATCH", { tint }));
  }

  function handleToggleShowInFilter(category: TagCategoryRow) {
    withBusy(category.id, () =>
      api(`/api/admin/tag-categories/${category.id}`, "PATCH", { showInFilter: !category.showInFilter })
    );
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[target];
    withBusy(a.id, async () => {
      await api(`/api/admin/tag-categories/${a.id}`, "PATCH", { order: b.order });
      await api(`/api/admin/tag-categories/${b.id}`, "PATCH", { order: a.order });
    });
  }

  function handleDelete(category: TagCategoryRow) {
    if (!confirm(`Delete "${category.label}"? Its tags become uncategorized, not deleted.`)) return;
    withBusy(category.id, () => api(`/api/admin/tag-categories/${category.id}`, "DELETE"));
  }

  async function handleCreate() {
    if (!newLabel.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api("/api/admin/tag-categories", "POST", { label: newLabel, tint: newTint, showInFilter: true });
      setNewLabel("");
      setNewTint("accent");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {sorted.map((category, index) => (
          <div key={category.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1 py-0"
                disabled={index === 0 || busyId === category.id}
                onClick={() => handleMove(index, -1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1 py-0"
                disabled={index === sorted.length - 1 || busyId === category.id}
                onClick={() => handleMove(index, 1)}
              >
                ↓
              </Button>
            </div>
            <Input
              defaultValue={category.label}
              className="max-w-56"
              disabled={busyId === category.id}
              onBlur={(e) => handleRename(category, e.target.value)}
            />
            <span className="text-xs text-muted">({category.slug})</span>
            <Select
              value={category.tint}
              disabled={busyId === category.id}
              onChange={(e) => handleTintChange(category, e.target.value)}
              className="w-32 text-xs"
            >
              {TINT_OPTIONS.map((tint) => (
                <option key={tint} value={tint}>
                  {tint}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={category.showInFilter}
                disabled={busyId === category.id}
                onChange={() => handleToggleShowInFilter(category)}
              />
              Show in filter bar
            </label>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="ml-auto"
              disabled={busyId === category.id}
              onClick={() => handleDelete(category)}
            >
              Delete
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3">
        <Input
          placeholder="New category label, e.g. Language"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="max-w-56"
        />
        <Select value={newTint} onChange={(e) => setNewTint(e.target.value as FilterDropdownTint)} className="w-32 text-xs">
          {TINT_OPTIONS.map((tint) => (
            <option key={tint} value={tint}>
              {tint}
            </option>
          ))}
        </Select>
        <Button type="button" size="sm" disabled={!newLabel.trim() || creating} onClick={handleCreate}>
          {creating ? "Adding..." : "Add category"}
        </Button>
      </div>
    </div>
  );
}
