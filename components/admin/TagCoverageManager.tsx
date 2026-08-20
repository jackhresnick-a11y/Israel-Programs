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

export type CoverageRow = {
  id: string;
  name: string;
  slug: string;
  durationLabel: string;
  hasScholarship: boolean | null;
  hasCollegeCredit: boolean | null;
  travelType: string | null;
  typeTags: { slug: string; name: string }[];
  essenceTags: { slug: string; name: string }[];
  otherTags: { slug: string; name: string; category: string }[];
};

const PAGE_SIZE = 50;

async function saveCategoryTags(programId: string, category: "program-type" | "essence", slugs: string[]) {
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

function CoverageRowCard({
  row,
  typeOptions,
  essenceOptions,
}: {
  row: CoverageRow;
  typeOptions: CategoryTagOption[];
  essenceOptions: CategoryTagOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typeSlugs, setTypeSlugs] = useState(row.typeTags.map((t) => t.slug));
  const [essenceSlugs, setEssenceSlugs] = useState(row.essenceTags.map((t) => t.slug));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeChanged = JSON.stringify([...typeSlugs].sort()) !== JSON.stringify(row.typeTags.map((t) => t.slug).sort());
  const essenceChanged =
    JSON.stringify([...essenceSlugs].sort()) !== JSON.stringify(row.essenceTags.map((t) => t.slug).sort());

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const calls: Promise<void>[] = [];
      if (typeChanged) calls.push(saveCategoryTags(row.id, "program-type", typeSlugs));
      if (essenceChanged) calls.push(saveCategoryTags(row.id, "essence", essenceSlugs));
      await Promise.all(calls);
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

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
        {row.typeTags.length === 0 && <Badge tone="warning">Missing type</Badge>}
        {row.essenceTags.length === 0 && <Badge tone="warning">Missing essence</Badge>}
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
          <p>
            <span className="font-semibold">Type:</span>{" "}
            {row.typeTags.length > 0 ? row.typeTags.map((t) => t.name).join(", ") : "(none)"}
          </p>
          <p>
            <span className="font-semibold">Essence:</span>{" "}
            {row.essenceTags.length > 0 ? row.essenceTags.map((t) => t.name).join(", ") : "(none)"}
          </p>
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Program type
            <CategoryTagMultiSelect options={typeOptions} selected={typeSlugs} onChange={setTypeSlugs} disabled={busy} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Essence
            <CategoryTagMultiSelect
              options={essenceOptions}
              selected={essenceSlugs}
              onChange={setEssenceSlugs}
              disabled={busy}
            />
          </label>
          {error && <p className="rounded bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}
          <Button
            type="button"
            size="sm"
            className="self-start"
            disabled={busy || (!typeChanged && !essenceChanged)}
            onClick={handleSave}
          >
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    </Card>
  );
}

type Filter = "all" | "missing-type" | "missing-essence";

export default function TagCoverageManager({
  rows,
  typeOptions,
  essenceOptions,
}: {
  rows: CoverageRow[];
  typeOptions: CategoryTagOption[];
  essenceOptions: CategoryTagOption[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = rows;
    if (term) result = result.filter((r) => r.name.toLowerCase().includes(term));
    if (filter === "missing-type") result = result.filter((r) => r.typeTags.length === 0);
    if (filter === "missing-essence") result = result.filter((r) => r.essenceTags.length === 0);
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

  const missingTypeCount = rows.filter((r) => r.typeTags.length === 0).length;
  const missingEssenceCount = rows.filter((r) => r.essenceTags.length === 0).length;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-xs text-muted">
          {rows.length} published programs — {missingTypeCount} missing a type tag, {missingEssenceCount} missing
          an essence tag
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
            <Button
              type="button"
              variant={filter === "missing-type" ? "primary" : "secondary"}
              size="sm"
              onClick={() => updateFilter("missing-type")}
            >
              Missing type
            </Button>
            <Button
              type="button"
              variant={filter === "missing-essence" ? "primary" : "secondary"}
              size="sm"
              onClick={() => updateFilter("missing-essence")}
            >
              Missing essence
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {paged.map((row) => (
          <CoverageRowCard key={row.id} row={row} typeOptions={typeOptions} essenceOptions={essenceOptions} />
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
