"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import type { FilterDropdownTint } from "@/components/ui/FilterDropdown";

export type DurationOptionRow = {
  value: string;
  label: string;
  order: number;
  showInFilter: boolean;
};

export type FilterHeaderConfig = { label: string; tint: string; show: boolean };

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
 * Duration options come from the fixed DurationType enum (see prisma/schema.prisma) --
 * unlike tags/regions there's no add/delete here, only rename, reorder, and per-option
 * show/hide in the filter bar. The header row (label/tint/visibility of the "Duration"
 * dropdown itself) is separate SiteContent state, same pattern as Region's header below.
 */
export default function DurationManager({
  options,
  header,
}: {
  options: DurationOptionRow[];
  header: FilterHeaderConfig;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyValue, setBusyValue] = useState<string | null>(null);
  const [headerBusy, setHeaderBusy] = useState(false);

  const sorted = [...options].sort((a, b) => a.order - b.order);

  async function withBusy(value: string, fn: () => Promise<void>) {
    setBusyValue(value);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyValue(null);
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

  function handleRename(option: DurationOptionRow, label: string) {
    if (!label.trim() || label === option.label) return;
    withBusy(option.value, () =>
      api(`/api/admin/duration-options/${option.value}`, "PATCH", { label })
    );
  }

  function handleToggleShowInFilter(option: DurationOptionRow) {
    withBusy(option.value, () =>
      api(`/api/admin/duration-options/${option.value}`, "PATCH", {
        showInFilter: !option.showInFilter,
      })
    );
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[target];
    withBusy(a.value, async () => {
      await api(`/api/admin/duration-options/${a.value}`, "PATCH", { order: b.order });
      await api(`/api/admin/duration-options/${b.value}`, "PATCH", { order: a.order });
    });
  }

  function handleHeaderRename(label: string) {
    if (!label.trim() || label === header.label) return;
    withHeaderBusy(() => api("/api/admin/filter-config", "PATCH", { target: "duration", label }));
  }

  function handleHeaderTintChange(tint: string) {
    withHeaderBusy(() => api("/api/admin/filter-config", "PATCH", { target: "duration", tint }));
  }

  function handleHeaderToggleShow() {
    withHeaderBusy(() =>
      api("/api/admin/filter-config", "PATCH", { target: "duration", showInFilter: !header.show })
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
        {sorted.map((option, index) => (
          <div key={option.value} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1 py-0"
                disabled={index === 0 || busyValue === option.value}
                onClick={() => handleMove(index, -1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1 py-0"
                disabled={index === sorted.length - 1 || busyValue === option.value}
                onClick={() => handleMove(index, 1)}
              >
                ↓
              </Button>
            </div>
            <Input
              defaultValue={option.label}
              className="max-w-56"
              disabled={busyValue === option.value}
              onBlur={(e) => handleRename(option, e.target.value)}
            />
            <span className="text-xs text-muted">({option.value})</span>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={option.showInFilter}
                disabled={busyValue === option.value}
                onChange={() => handleToggleShowInFilter(option)}
              />
              Show in filter bar
            </label>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        Duration options come from a fixed set; hide one to remove it from the filter bar.
      </p>
    </div>
  );
}
