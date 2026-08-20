"use client";

import { cn } from "@/lib/cn";

export type CategoryTagOption = { slug: string; name: string };

/**
 * A closed-set, single-category multi-select: unlike TagPicker (comma-separated names
 * across every category, with a "create new tag" input), this only ever offers the tags
 * already seeded in one category and never mints a new one -- see the tag-governance
 * rule in CLAUDE.md ("never introduce new tag values ... propose from existing set").
 * Rendered as toggle chips rather than a checkbox popover: these categories are small
 * (a handful of tags each), so showing every option inline is both simpler and more
 * touch-friendly than a dropdown on a phone.
 */
export default function CategoryTagMultiSelect({
  options,
  selected,
  onChange,
  disabled = false,
}: {
  options: CategoryTagOption[];
  selected: string[];
  onChange: (slugs: string[]) => void;
  disabled?: boolean;
}) {
  const selectedSet = new Set(selected);

  function toggle(slug: string) {
    if (disabled) return;
    const next = selectedSet.has(slug)
      ? selected.filter((s) => s !== slug)
      : [...selected, slug];
    onChange(next);
  }

  if (options.length === 0) {
    return <p className="text-xs italic text-muted">No tags seeded in this category.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isSelected = selectedSet.has(option.slug);
        return (
          <button
            key={option.slug}
            type="button"
            disabled={disabled}
            onClick={() => toggle(option.slug)}
            aria-pressed={isSelected}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors duration-[120ms] ease-out",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isSelected
                ? "bg-accent/15 text-accent-hover"
                : "border border-border text-muted hover:bg-surface-muted"
            )}
          >
            {option.name}
          </button>
        );
      })}
    </div>
  );
}
