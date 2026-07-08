"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DURATION_LABELS } from "@/lib/duration";
import { REGION_LABELS, REGION_ORDER, REGION_TO_SLUGS } from "@/lib/regions";
import { coerceTint } from "@/lib/tagTints";
import Input from "@/components/ui/Input";
import { buttonVariants } from "@/components/ui/Button";
import FilterDropdown from "@/components/ui/FilterDropdown";

type SearchBarProps = {
  tags: { slug: string; name: string; category: string | null }[];
  categories: { slug: string; label: string; tint: string; order: number; showInFilter: boolean }[];
};

export default function SearchBar({ tags, categories }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  const activeTags = (searchParams.get("tags") ?? "").split(",").filter(Boolean);
  const activeDurations = (searchParams.get("duration") ?? "").split(",").filter(Boolean);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/programs?${params.toString()}`);
  }

  // Toggles a whole group of location-tag slugs together (used by Region, where
  // one region maps to several underlying tags) as well as single-tag toggles
  // (each tag-backed category dropdown passes a 1-item array).
  function toggleSlugs(slugs: string[]) {
    if (slugs.length === 0) return;
    const anyActive = slugs.some((slug) => activeTags.includes(slug));
    const next = anyActive
      ? activeTags.filter((t) => !slugs.includes(t))
      : Array.from(new Set([...activeTags, ...slugs]));
    updateParams({ tags: next.length > 0 ? next.join(",") : null });
  }

  function toggleDuration(value: string) {
    const next = activeDurations.includes(value)
      ? activeDurations.filter((d) => d !== value)
      : [...activeDurations, value];
    updateParams({ duration: next.length > 0 ? next.join(",") : null });
  }

  const byCategory = new Map<string, { slug: string; name: string }[]>();
  for (const tag of tags) {
    if (!tag.category) continue;
    const bucket = byCategory.get(tag.category);
    if (bucket) bucket.push(tag);
    else byCategory.set(tag.category, [tag]);
  }

  const durationOptions = Object.entries(DURATION_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const regionOptions = REGION_ORDER
    .filter((region) => REGION_TO_SLUGS[region].length > 0)
    .map((region) => ({
      value: region,
      label: REGION_LABELS[region],
    }));
  const activeRegions = REGION_ORDER.filter((region) =>
    REGION_TO_SLUGS[region].some((slug) => activeTags.includes(slug))
  );

  // Tag-backed dropdowns are entirely data-driven off TagCategory rows (admin-editable,
  // see app/admin/tags) instead of a hardcoded per-category block -- a new category
  // shows up here with zero code changes. Duration (a Program column, not a tag) and
  // Region (a UI-only grouping over `location` tags, see lib/regions.ts) stay special-cased.
  const categoryDropdowns = categories
    .filter((c) => c.showInFilter)
    .sort((a, b) => a.order - b.order)
    .map((category) => {
      const options = (byCategory.get(category.slug) ?? []).map((t) => ({
        value: t.slug,
        label: t.name,
      }));
      // Each dropdown's "selected" list is scoped to its own options so the count badge
      // reflects that category only, not every active tag across all categories.
      const selected = activeTags.filter((t) => options.some((o) => o.value === t));
      return { category, options, selected };
    });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted p-3 shadow-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateParams({ q: q || null });
        }}
        className="flex gap-2"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, keyword, or #hashtag..."
          className="w-full"
        />
        <button type="submit" className={buttonVariants({ variant: "primary" })}>
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <FilterDropdown
          label="Duration"
          options={durationOptions}
          selected={activeDurations}
          onToggle={toggleDuration}
          tint="accent"
        />
        {categoryDropdowns.map(({ category, options, selected }) => (
          <FilterDropdown
            key={category.slug}
            label={category.label}
            options={options}
            selected={selected}
            onToggle={(slug) => toggleSlugs([slug])}
            tint={coerceTint(category.tint)}
          />
        ))}
        <FilterDropdown
          label="Region"
          options={regionOptions}
          selected={activeRegions}
          onToggle={(region) => toggleSlugs(REGION_TO_SLUGS[region])}
          tint="danger"
        />

        <Link
          href="/programs/new"
          className={buttonVariants({ variant: "primary", className: "ml-auto" })}
        >
          Add Program
        </Link>
      </div>
    </div>
  );
}
