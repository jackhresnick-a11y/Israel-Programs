"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import type { RecentlyAddedItem, RecentlyAddedMode } from "@/lib/recentlyAdded";

type ProgramOption = { slug: string; name: string };
type VideoOption = { id: string; label: string };

async function patch(body: object) {
  const res = await fetch("/api/admin/recently-added", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error ?? "Failed to save");
  }
}

export default function RecentlyAddedForm({
  currentHeading,
  currentMode,
  currentItems,
  programOptions,
  videosBySlug,
}: {
  currentHeading: string;
  currentMode: RecentlyAddedMode;
  currentItems: RecentlyAddedItem[];
  programOptions: ProgramOption[];
  videosBySlug: Record<string, VideoOption[]>;
}) {
  const router = useRouter();
  const [heading, setHeading] = useState(currentHeading);
  const [savingHeading, setSavingHeading] = useState(false);
  const [mode, setMode] = useState<RecentlyAddedMode>(currentMode);
  const [savingMode, setSavingMode] = useState(false);
  const [items, setItems] = useState<RecentlyAddedItem[]>(currentItems);
  const [addSlug, setAddSlug] = useState("");
  const [savingItems, setSavingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameBySlug = new Map(programOptions.map((p) => [p.slug, p.name]));
  const addedSlugs = new Set(items.map((i) => i.slug));
  const available = programOptions.filter((p) => !addedSlugs.has(p.slug));
  const itemsDirty = JSON.stringify(items) !== JSON.stringify(currentItems);

  async function handleSaveHeading(e: React.FormEvent) {
    e.preventDefault();
    setSavingHeading(true);
    setError(null);
    try {
      await patch({ heading });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save heading");
    } finally {
      setSavingHeading(false);
    }
  }

  async function handleChangeMode(next: RecentlyAddedMode) {
    setMode(next);
    setSavingMode(true);
    setError(null);
    try {
      await patch({ mode: next });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mode");
    } finally {
      setSavingMode(false);
    }
  }

  function handleAdd() {
    if (!addSlug || addedSlugs.has(addSlug)) return;
    setItems([...items, { slug: addSlug }]);
    setAddSlug("");
  }

  function handleRemove(slug: string) {
    setItems(items.filter((i) => i.slug !== slug));
  }

  function handleVideoChange(slug: string, videoId: string) {
    setItems(
      items.map((i) => (i.slug === slug ? { slug, videoId: videoId || undefined } : i))
    );
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  }

  async function handleSaveItems() {
    setSavingItems(true);
    setError(null);
    try {
      await patch({ items });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save program list");
    } finally {
      setSavingItems(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>
      )}

      <form onSubmit={handleSaveHeading} className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-foreground">Section heading</span>
        <div className="flex gap-2">
          <Input
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            className="max-w-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!heading.trim() || heading === currentHeading || savingHeading}
          >
            {savingHeading ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-foreground">Mode</span>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="recentlyAddedMode"
            checked={mode === "auto"}
            disabled={savingMode}
            onChange={() => handleChangeMode("auto")}
          />
          Automatic — show the 6 most recently added programs
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="recentlyAddedMode"
            checked={mode === "manual"}
            disabled={savingMode}
            onChange={() => handleChangeMode("manual")}
          />
          Manual curation — hand-pick which programs appear
        </label>
      </div>

      {mode === "manual" && (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <span className="text-sm font-medium text-foreground">
            Featured programs ({items.length})
          </span>
          {items.length === 0 && (
            <p className="text-sm text-muted">
              No programs added yet — the section will be hidden until you add at least one.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {items.map((item, index) => {
              const videos = videosBySlug[item.slug] ?? [];
              return (
                <div
                  key={item.slug}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {nameBySlug.get(item.slug) ?? item.slug}
                  </span>
                  <Select
                    value={item.videoId ?? ""}
                    onChange={(e) => handleVideoChange(item.slug, e.target.value)}
                    className="text-xs"
                    disabled={videos.length === 0}
                  >
                    <option value="">
                      {videos.length === 0 ? "No videos uploaded" : "No video"}
                    </option>
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => handleMove(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === items.length - 1}
                    onClick={() => handleMove(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRemove(item.slug)}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Select
              value={addSlug}
              onChange={(e) => setAddSlug(e.target.value)}
              className="max-w-xs"
            >
              <option value="">Add a program…</option>
              {available.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Button type="button" variant="secondary" size="sm" disabled={!addSlug} onClick={handleAdd}>
              Add
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            className="w-fit"
            disabled={!itemsDirty || savingItems}
            onClick={handleSaveItems}
          >
            {savingItems ? "Saving..." : "Save program list"}
          </Button>
        </div>
      )}
    </div>
  );
}
