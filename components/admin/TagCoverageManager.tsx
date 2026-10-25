"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import CategoryTagMultiSelect, { type CategoryTagOption } from "@/components/ui/CategoryTagMultiSelect";
import { TRAVEL_TYPE_LABELS } from "@/lib/facets";

export type CoverageCategory = {
  slug: string;
  shortLabel: string;
  label: string;
  options: CategoryTagOption[];
};

export type CoverageRow = {
  id: string;
  name: string;
  slug: string;
  durationLabel: string;
  hasScholarship: boolean | null;
  hasCollegeCredit: boolean | null;
  travelType: string | null;
  /** Keyed by CoverageCategory.slug -- one entry per editable category. */
  categoryTags: Record<string, { slug: string; name: string }[]>;
  otherTags: { slug: string; name: string; category: string }[];
};

const PAGE_SIZE = 50;

async function saveCategoryTags(programId: string, category: string, slugs: string[]) {
  const res = await fetch(`/api/admin/programs/${programId}/category-tags`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, slugs }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Request failed");
  }
}

function sortedEqual(a: string[], b: string[]) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function CoverageRowCard({ row, categories }: { row: CoverageRow; categories: CoverageCategory[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const c of categories) initial[c.slug] = row.categoryTags[c.slug]?.map((t) => t.slug) ?? [];
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changedSlugs = categories
    .map((c) => c.slug)
    .filter((slug) => !sortedEqual(selected[slug] ?? [], (row.categoryTags[slug] ?? []).map((t) => t.slug)));
  const isDirty = changedSlugs.length > 0;

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await Promise.all(changedSlugs.map((slug) => saveCategoryTags(row.id, slug, selected[slug] ?? [])));
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  const missingCategories = categories.filter((c) => (row.categoryTags[c.slug]?.length ?? 0) === 0);

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/programs/${row.slug}`}
          target="_blank"
          className="text-sm font-medium text-foreground hover:underline"
        >
          {row.name}
        </Link>
        {missingCategories.map((c) => (
          <Badge key={c.slug} tone="warning">
            Missing {c.shortLabel}
          </Badge>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="ml-auto"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Edit tags"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        <Badge tone="neutral">{row.durationLabel}</Badge>
        {row.hasScholarship && <Badge tone="info">Scholarship</Badge>}
        {row.hasCollegeCredit && <Badge tone="info">College credit</Badge>}
        {row.travelType && <Badge tone="neutral">{TRAVEL_TYPE_LABELS[row.travelType] ?? row.travelType}</Badge>}
        {row.otherTags.map((t) => (
          <Badge key={t.slug} tone="tag">
            {t.name}
          </Badge>
        ))}
      </div>

      {!open && (
        <div className="flex flex-col gap-1 text-xs text-muted">
          {categories.map((c) => {
            const tags = row.categoryTags[c.slug] ?? [];
            return (
              <p key={c.slug}>
                <span className="font-semibold">{c.label}:</span>{" "}
                {tags.length > 0 ? tags.map((t) => t.name).join(", ") : "(none)"}
              </p>
            );
          })}
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {categories.map((c) => (
            <label key={c.slug} className="flex flex-col gap-1 text-xs font-semibold text-muted">
              {c.label}
              <CategoryTagMultiSelect
                options={c.options}
                selected={selected[c.slug] ?? []}
                onChange={(slugs) => setSelected((prev) => ({ ...prev, [c.slug]: slugs }))}
                disabled={busy}
              />
            </label>
          ))}
          {error && <p className="rounded bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}
          <Button type="button" size="sm" className="self-start" disabled={busy || !isDirty} onClick={handleSave}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    </Card>
  );
}

type Filter = "all" | `missing:${string}`;

export default function TagCoverageManager({
  rows,
  categories,
}: {
  rows: CoverageRow[];
  categories: CoverageCategory[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = rows;
    if (term) result = result.filter((r) => r.name.toLowerCase().includes(term));
    if (filter.startsWith("missing:")) {
      const slug = filter.slice("missing:".length);
      result = result.filter((r) => (r.categoryTags[slug]?.length ?? 0) === 0);
    }
    return result;
  }, [rows, search, filter]);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateFilter(value: Filter) {
    setFilter(value);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const paged = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const missingCounts = categories.map((c) => ({
    ...c,
    count: rows.filter((r) => (r.categoryTags[c.slug]?.length ?? 0) === 0).length,
  }));

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-xs text-muted">
          {rows.length} published programs —{" "}
          {missingCounts.map((c, i) => (
            <span key={c.slug}>
              {i > 0 && ", "}
              {c.count} missing {c.shortLabel}
            </span>
          ))}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={`Search ${rows.length} programs by name...`}
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={filter === "all" ? "primary" : "secondary"}
              size="sm"
              onClick={() => updateFilter("all")}
            >
              All
            </Button>
            {categories.map((c) => (
              <Button
                key={c.slug}
                type="button"
                variant={filter === `missing:${c.slug}` ? "primary" : "secondary"}
                size="sm"
                onClick={() => updateFilter(`missing:${c.slug}`)}
              >
                Missing {c.shortLabel}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {paged.map((row) => (
          <CoverageRowCard key={row.id} row={row} categories={categories} />
        ))}
        {paged.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted">No programs match.</p>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={clampedPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted">
            Page {clampedPage} of {pageCount} ({filtered.length} programs)
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={clampedPage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
