"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

export type TagRow = { id: string; name: string; slug: string; category: string | null; order: number };
export type CategoryOption = { slug: string; label: string };

const UNCATEGORIZED = "__none__";

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

export default function TagManager({
  tags,
  categories,
}: {
  tags: TagRow[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>(UNCATEGORIZED);
  const [creating, setCreating] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [merging, setMerging] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tags;
    return tags.filter(
      (t) => t.name.toLowerCase().includes(term) || t.slug.toLowerCase().includes(term)
    );
  }, [tags, search]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, TagRow[]>();
    const uncategorized: TagRow[] = [];
    for (const tag of filtered) {
      if (!tag.category) {
        uncategorized.push(tag);
        continue;
      }
      const bucket = byCategory.get(tag.category);
      if (bucket) bucket.push(tag);
      else byCategory.set(tag.category, [tag]);
    }
    const known = categories.map((c) => ({ category: c, tags: byCategory.get(c.slug) ?? [] }));
    // A tag's category may reference a slug with no surviving TagCategory row
    // (e.g. the row was deleted directly) -- surface those under "Other" too
    // rather than silently dropping them.
    const knownSlugs = new Set(categories.map((c) => c.slug));
    const orphaned = Array.from(byCategory.entries())
      .filter(([slug]) => !knownSlugs.has(slug))
      .flatMap(([, rows]) => rows);
    return { known, other: [...uncategorized, ...orphaned] };
  }, [filtered, categories]);

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

  function handleRename(tag: TagRow, name: string) {
    if (!name.trim() || name === tag.name) return;
    withBusy(tag.id, () => api(`/api/admin/tags/${tag.id}`, "PATCH", { name }));
  }

  function handleCategoryChange(tag: TagRow, category: string) {
    withBusy(tag.id, () =>
      api(`/api/admin/tags/${tag.id}`, "PATCH", { category: category === UNCATEGORIZED ? null : category })
    );
  }

  function handleDelete(tag: TagRow) {
    if (!confirm(`Delete tag "${tag.name}"? It will be removed from every program using it.`)) return;
    withBusy(tag.id, () => api(`/api/admin/tags/${tag.id}`, "DELETE"));
  }

  function handleMove(rows: TagRow[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const a = rows[index];
    const b = rows[target];
    withBusy(a.id, async () => {
      await api(`/api/admin/tags/${a.id}`, "PATCH", { order: b.order });
      await api(`/api/admin/tags/${b.id}`, "PATCH", { order: a.order });
    });
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api("/api/admin/tags", "POST", {
        name: newName,
        category: newCategory === UNCATEGORIZED ? null : newCategory,
      });
      setNewName("");
      setNewCategory(UNCATEGORIZED);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setCreating(false);
    }
  }

  async function handleMerge() {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) return;
    setMerging(true);
    setError(null);
    try {
      await api("/api/admin/tags/merge", "POST", { sourceId: mergeSourceId, targetId: mergeTargetId });
      setMergeSourceId("");
      setMergeTargetId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge tags");
    } finally {
      setMerging(false);
    }
  }

  const reorderable = search.trim() === "";

  function renderRow(rows: TagRow[], index: number) {
    const tag = rows[index];
    return (
      <div key={tag.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
        {reorderable && (
          <div className="flex flex-col gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-1 py-0"
              disabled={index === 0 || busyId === tag.id}
              onClick={() => handleMove(rows, index, -1)}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-1 py-0"
              disabled={index === rows.length - 1 || busyId === tag.id}
              onClick={() => handleMove(rows, index, 1)}
            >
              ↓
            </Button>
          </div>
        )}
        <Input
          defaultValue={tag.name}
          className="max-w-56 text-sm"
          disabled={busyId === tag.id}
          onBlur={(e) => handleRename(tag, e.target.value)}
        />
        <Badge tone="tag">{tag.slug}</Badge>
        <Select
          value={tag.category ?? UNCATEGORIZED}
          disabled={busyId === tag.id}
          onChange={(e) => handleCategoryChange(tag, e.target.value)}
          className="w-44 text-xs"
        >
          <option value={UNCATEGORIZED}>Uncategorized</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="ml-auto"
          disabled={busyId === tag.id}
          onClick={() => handleDelete(tag)}
        >
          Delete
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      <Input
        placeholder="Search tags by name or slug..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="flex flex-col gap-4">
        {groups.known.map(({ category, tags: rows }) => (
          <div key={category.slug} className="flex flex-col gap-1">
            <h3 className="px-1 text-sm font-semibold text-foreground">
              {category.label} ({rows.length})
            </h3>
            {rows.length === 0 ? (
              <p className="px-4 py-2 text-xs text-muted">No tags in this category yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {rows.map((_, index) => renderRow(rows, index))}
              </div>
            )}
          </div>
        ))}

        <div className="flex flex-col gap-1">
          <h3 className="px-1 text-sm font-semibold text-foreground">
            Other / uncategorized ({groups.other.length})
          </h3>
          <div className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {groups.other.map((_, index) => renderRow(groups.other, index))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3">
        <Input
          placeholder="New tag name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="max-w-56"
        />
        <Select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-44 text-xs">
          <option value={UNCATEGORIZED}>Uncategorized</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </Select>
        <Button type="button" size="sm" disabled={!newName.trim() || creating} onClick={handleCreate}>
          {creating ? "Adding..." : "Add tag"}
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
        <span className="text-sm font-medium text-foreground">Merge duplicate tags</span>
        <p className="text-xs text-muted">
          Moves every program from the first tag onto the second, then deletes the first.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={mergeSourceId} onChange={(e) => setMergeSourceId(e.target.value)} className="w-48 text-xs">
            <option value="">Merge this tag...</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted">into</span>
          <Select value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)} className="w-48 text-xs">
            <option value="">...this tag</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId || merging}
            onClick={handleMerge}
          >
            {merging ? "Merging..." : "Merge"}
          </Button>
        </div>
      </div>
    </div>
  );
}
