"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import type { FilterDropdownTint } from "@/components/ui/FilterDropdown";
import type { FilterHeaderConfig } from "@/components/DurationManager";

export type RegionRow = {
  id: string;
  slug: string;
  label: string;
  order: number;
  memberSlugs: string[];
};

export type LocationTagOption = { slug: string; name: string };

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

/**
 * A region is a named grouping of `location`-category tag slugs (see lib/regions.ts) --
 * unlike Duration, regions can be freely created/renamed/reordered/deleted, and each
 * region's membership is edited as a checkbox list over the site's location tags.
 */
export default function RegionManager({
  regions,
  locationTags,
  header,
}: {
  regions: RegionRow[];
  locationTags: LocationTagOption[];
  header: FilterHeaderConfig;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [headerBusy, setHeaderBusy] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const sorted = [...regions].sort((a, b) => a.order - b.order);

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

  async function withHeaderBusy(fn: () => Promise<void>) {
    setHeaderBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setHeaderBusy(false);
    }
  }

  function handleRename(region: RegionRow, label: string) {
    if (!label.trim() || label === region.label) return;
    withBusy(region.id, () => api(`/api/admin/regions/${region.id}`, "PATCH", { label }));
  }

  function handleToggleMember(region: RegionRow, slug: string) {
    const next = region.memberSlugs.includes(slug)
      ? region.memberSlugs.filter((s) => s !== slug)
      : [...region.memberSlugs, slug];
    withBusy(region.id, () =>
      api(`/api/admin/regions/${region.id}`, "PATCH", { memberSlugs: next })
    );
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[target];
    withBusy(a.id, async () => {
      await api(`/api/admin/regions/${a.id}`, "PATCH", { order: b.order });
      await api(`/api/admin/regions/${b.id}`, "PATCH", { order: a.order });
    });
  }

  function handleDelete(region: RegionRow) {
    if (!confirm(`Delete region "${region.label}"? Its member tags are unaffected.`)) return;
    withBusy(region.id, () => api(`/api/admin/regions/${region.id}`, "DELETE"));
  }

  async function handleCreate() {
    if (!newLabel.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api("/api/admin/regions", "POST", { label: newLabel, memberSlugs: [] });
      setNewLabel("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create region");
    } finally {
      setCreating(false);
    }
  }

  function handleHeaderRename(label: string) {
    if (!label.trim() || label === header.label) return;
    withHeaderBusy(() => api("/api/admin/filter-config", "PATCH", { target: "region", label }));
  }

  function handleHeaderTintChange(tint: string) {
    withHeaderBusy(() => api("/api/admin/filter-config", "PATCH", { target: "region", tint }));
  }

  function handleHeaderToggleShow() {
    withHeaderBusy(() =>
      api("/api/admin/filter-config", "PATCH", { target: "region", showInFilter: !header.show })
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-4 py-3">
        <span className="text-xs text-muted">Dropdown header:</span>
        <Input
          defaultValue={header.label}
          className="max-w-56"
          disabled={headerBusy}
          onBlur={(e) => handleHeaderRename(e.target.value)}
        />
        <Select
          value={header.tint}
          disabled={headerBusy}
          onChange={(e) => handleHeaderTintChange(e.target.value)}
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
            checked={header.show}
            disabled={headerBusy}
            onChange={handleHeaderToggleShow}
          />
          Show in filter bar
        </label>
      </div>

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {sorted.map((region, index) => (
          <div key={region.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 py-0"
                  disabled={index === 0 || busyId === region.id}
                  onClick={() => handleMove(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 py-0"
                  disabled={index === sorted.length - 1 || busyId === region.id}
                  onClick={() => handleMove(index, 1)}
                >
                  ↓
                </Button>
              </div>
              <Input
                defaultValue={region.label}
                className="max-w-56"
                disabled={busyId === region.id}
                onBlur={(e) => handleRename(region, e.target.value)}
              />
              <span className="text-xs text-muted">({region.slug})</span>
              <span className="text-xs text-muted">
                {region.memberSlugs.length} location tag{region.memberSlugs.length === 1 ? "" : "s"}
              </span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="ml-auto"
                disabled={busyId === region.id}
                onClick={() => handleDelete(region)}
              >
                Delete
              </Button>
            </div>
            {locationTags.length === 0 ? (
              <p className="pl-8 text-xs text-muted">No location tags exist yet.</p>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1 pl-8">
                {locationTags.map((tag) => (
                  <label
                    key={tag.slug}
                    className="flex items-center gap-1.5 text-xs text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={region.memberSlugs.includes(tag.slug)}
                      disabled={busyId === region.id}
                      onChange={() => handleToggleMember(region, tag.slug)}
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3">
        <Input
          placeholder="New region label, e.g. Golan"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="max-w-56"
        />
        <Button type="button" size="sm" disabled={!newLabel.trim() || creating} onClick={handleCreate}>
          {creating ? "Adding..." : "Add region"}
        </Button>
      </div>
    </div>
  );
}
