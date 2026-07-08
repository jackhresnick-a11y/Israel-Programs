"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export type TagOption = { slug: string; name: string; category: string | null };
export type TagCategoryOption = { slug: string; label: string };

type TagPickerProps = {
  /** Comma-separated tag names -- the exact same contract the old free-text `tags`
   * field used, so parseTags/tagConnections/the edit-diff pipeline are untouched. */
  value: string;
  onChange: (value: string) => void;
  allTags: TagOption[];
  categories: TagCategoryOption[];
};

function parseNames(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,#]/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );
}

export default function TagPicker({ value, onChange, allTags, categories }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newTagInput, setNewTagInput] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selectedNames = parseNames(value);
  const selectedLower = new Set(selectedNames.map((n) => n.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle(name: string) {
    const lower = name.toLowerCase();
    const next = selectedLower.has(lower)
      ? selectedNames.filter((n) => n.toLowerCase() !== lower)
      : [...selectedNames, name];
    onChange(next.join(", "));
  }

  function addNewTag() {
    const name = newTagInput.trim();
    if (!name || selectedLower.has(name.toLowerCase())) {
      setNewTagInput("");
      return;
    }
    onChange([...selectedNames, name].join(", "));
    setNewTagInput("");
  }

  const term = search.trim().toLowerCase();
  const grouped = useMemo(() => {
    const byCategory = new Map<string, TagOption[]>();
    const uncategorized: TagOption[] = [];
    for (const tag of allTags) {
      if (term && !tag.name.toLowerCase().includes(term) && !tag.slug.includes(term)) continue;
      if (!tag.category) {
        uncategorized.push(tag);
        continue;
      }
      const bucket = byCategory.get(tag.category);
      if (bucket) bucket.push(tag);
      else byCategory.set(tag.category, [tag]);
    }
    return { byCategory, uncategorized };
  }, [allTags, term]);

  return (
    <div ref={ref} className="relative flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground transition hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span>
          {selectedNames.length > 0
            ? `${selectedNames.length} tag${selectedNames.length === 1 ? "" : "s"} selected`
            : "Select tags..."}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="none"
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")}
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedNames.map((name) => (
            <Badge key={name} tone="tag" className="gap-1">
              {name}
              <button
                type="button"
                onClick={() => toggle(name)}
                aria-label={`Remove ${name}`}
                className="ml-0.5 hover:text-danger"
              >
                &times;
              </button>
            </Badge>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute top-full z-20 mt-1 w-full min-w-72 rounded-lg border border-border bg-surface p-2 shadow-lg">
          <Input
            autoFocus
            placeholder="Search tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 w-full text-sm"
          />

          <div className="max-h-72 overflow-y-auto">
            {categories.map((category) => {
              const options = grouped.byCategory.get(category.slug) ?? [];
              if (options.length === 0) return null;
              return (
                <div key={category.slug} className="mb-2">
                  <p className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
                    {category.label}
                  </p>
                  {options.map((tag) => (
                    <label
                      key={tag.slug}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-surface-muted"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLower.has(tag.name.toLowerCase())}
                        onChange={() => toggle(tag.name)}
                        className="accent-accent"
                      />
                      {tag.name}
                    </label>
                  ))}
                </div>
              );
            })}

            {grouped.uncategorized.length > 0 && (
              <div className="mb-2">
                <p className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  Other
                </p>
                {grouped.uncategorized.map((tag) => (
                  <label
                    key={tag.slug}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLower.has(tag.name.toLowerCase())}
                      onChange={() => toggle(tag.name)}
                      className="accent-accent"
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            )}

            {grouped.byCategory.size === 0 && grouped.uncategorized.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted">No tags match &ldquo;{search}&rdquo;.</p>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
            <Input
              placeholder="Create new tag..."
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNewTag();
                }
              }}
              className="flex-1 text-sm"
            />
            <Button type="button" variant="secondary" size="sm" disabled={!newTagInput.trim()} onClick={addNewTag}>
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
