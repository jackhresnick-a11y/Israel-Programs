"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import TagPicker, { type TagOption, type TagCategoryOption } from "@/components/ui/TagPicker";
import { programMatchesTagFilter } from "@/lib/adminFilters";

export type ProgramRow = {
  id: string;
  name: string;
  slug: string;
  organization: string | null;
  location: string | null;
  tags: { slug: string; name: string }[];
  responseCount: number;
  bestForPhrases: string[];
  editorialBestFor: string | null;
};

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

function ProgramRowCard({ program, allTags, categories }: { program: ProgramRow; allTags: TagOption[]; categories: TagCategoryOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorialBestFor, setEditorialBestFor] = useState(program.editorialBestFor ?? "");
  const [tagsValue, setTagsValue] = useState(program.tags.map((t) => t.name).join(", "));

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await Promise.all([
        api(`/api/admin/polls/programs/${program.id}`, "PATCH", {
          editorialBestFor: editorialBestFor.trim() || null,
        }),
        api(`/api/admin/programs/${program.id}/tags`, "PATCH", {
          tags: tagsValue
            .split(/[,#]/)
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      ]);
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  const strip = program.editorialBestFor ?? (program.bestForPhrases.length >= 2 ? program.bestForPhrases.join(" · ") : null);

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{program.name}</span>
        <span className="text-xs text-muted">
          {program.organization ?? "—"}
          {program.location ? ` · ${program.location}` : ""}
        </span>
        {program.editorialBestFor && <Badge tone="tag">Override</Badge>}
        <span className="ml-auto text-xs text-muted">
          {program.responseCount} response{program.responseCount === 1 ? "" : "s"}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Edit"}
        </Button>
      </div>

      <p className="text-xs text-muted">
        {strip ? <span className="text-foreground">{strip}</span> : "(no strip -- fewer than 2 eligible questions)"}
      </p>

      <div className="flex flex-wrap gap-1">
        {program.tags.map((t) => (
          <Badge key={t.slug} tone="tag">
            {t.name}
          </Badge>
        ))}
      </div>

      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

      {open && (
        <Card className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1 text-xs text-muted">
            &ldquo;Best for&rdquo; override (blank = use the generated strip above)
            <Input
              value={editorialBestFor}
              onChange={(e) => setEditorialBestFor(e.target.value)}
              placeholder="Leave blank to use the generated strip"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Tags
            <TagPicker value={tagsValue} onChange={setTagsValue} allTags={allTags} categories={categories} />
          </label>
          <Button type="button" size="sm" className="self-start" disabled={busy} onClick={handleSave}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </Card>
      )}
    </div>
  );
}

type SortKey = "name" | "responseCount";

export default function ProgramsAdminManager({
  programs,
  allTags,
  categories,
}: {
  programs: ProgramRow[];
  allTags: TagOption[];
  categories: TagCategoryOption[];
}) {
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [tagFilterSearch, setTagFilterSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const filteredTagOptions = useMemo(() => {
    const term = tagFilterSearch.trim().toLowerCase();
    if (!term) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(term) || t.slug.includes(term));
  }, [allTags, tagFilterSearch]);

  function toggleTagFilter(slug: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = programs;
    if (term) {
      result = result.filter((p) => p.name.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term));
    }
    if (selectedTags.size > 0) {
      const selectedTagSlugs = Array.from(selectedTags);
      result = result.filter((p) => programMatchesTagFilter(p.tags.map((t) => t.slug), selectedTagSlugs));
    }
    const sorted = [...result].sort((a, b) => {
      const cmp = sortKey === "name" ? a.name.localeCompare(b.name) : a.responseCount - b.responseCount;
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [programs, search, selectedTags, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((a) => !a);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            placeholder={`Search ${programs.length} programs by name or slug...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="flex gap-2">
            <Button type="button" variant={sortKey === "name" ? "primary" : "secondary"} size="sm" onClick={() => toggleSort("name")}>
              Name {sortKey === "name" ? (sortAsc ? "↑" : "↓") : ""}
            </Button>
            <Button
              type="button"
              variant={sortKey === "responseCount" ? "primary" : "secondary"}
              size="sm"
              onClick={() => toggleSort("responseCount")}
            >
              Responses {sortKey === "responseCount" ? (sortAsc ? "↑" : "↓") : ""}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted">Filter by tag (all selected must match)</p>
          {selectedTags.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {Array.from(selectedTags).map((slug) => {
                const tag = allTags.find((t) => t.slug === slug);
                return (
                  <Badge key={slug} tone="tag" className="gap-1">
                    {tag?.name ?? slug}
                    <button type="button" onClick={() => toggleTagFilter(slug)} className="ml-0.5 hover:text-danger">
                      &times;
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
          <Input
            placeholder="Search tags..."
            value={tagFilterSearch}
            onChange={(e) => setTagFilterSearch(e.target.value)}
            className="max-w-xs text-sm"
          />
          <div className="max-h-32 overflow-y-auto rounded-lg border border-border p-2">
            {filteredTagOptions.map((tag) => (
              <label key={tag.slug} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs text-foreground hover:bg-surface-muted">
                <input
                  type="checkbox"
                  checked={selectedTags.has(tag.slug)}
                  onChange={() => toggleTagFilter(tag.slug)}
                  className="accent-accent"
                />
                {tag.name}
              </label>
            ))}
            {filteredTagOptions.length === 0 && <p className="px-2 py-2 text-xs text-muted">No tags match.</p>}
          </div>
        </div>
      </Card>

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {filtered.map((program) => (
          <ProgramRowCard key={program.id} program={program} allTags={allTags} categories={categories} />
        ))}
        {filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No programs match.</p>}
      </div>
    </div>
  );
}
