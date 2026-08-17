"use client";

import { useMemo, useState } from "react";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";

export type FacetTagOption = { slug: string; name: string };
export type FacetDurationOption = { value: string; label: string };

type SectionItem = { id: string; label: string; selected: boolean };
type Section = { key: string; label: string; items: SectionItem[] };

const DURATION_SECTION_KEY = "duration";

/**
 * The tag/duration checkbox picker for one flow option, replacing the previous flat
 * wall of ~140 checkboxes with collapsible per-category sections (reusing the same
 * tagsByCategory grouping FlowQuestionsManager already computes), a name filter box
 * spanning every section, a selected-count badge on a collapsed section, and
 * currently-selected facets pinned in a removable row at the top so a reviewer never
 * has to hunt through a collapsed section to see what's already checked. A section
 * auto-expands when it contains a selection or a filter match; toggling any checkbox
 * calls straight back into the caller's onToggleTag/onToggleDuration -- this
 * component holds no selection state of its own, only local filter/expanded-section
 * UI state, so toggles stage into QuestionCard's draft exactly like every other
 * option field (see FlowQuestionsManager.tsx's QuestionCard).
 */
export default function FacetCheckboxGroups({
  tagsByCategory,
  durationOptions,
  selectedTagSlugs,
  selectedDurationValues,
  onToggleTag,
  onToggleDuration,
  disabled,
}: {
  tagsByCategory: Map<string, FacetTagOption[]>;
  durationOptions: FacetDurationOption[];
  selectedTagSlugs: string[];
  selectedDurationValues: string[];
  onToggleTag: (slug: string) => void;
  onToggleDuration: (value: string) => void;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [expandedOverride, setExpandedOverride] = useState<Record<string, boolean>>({});
  const query = filter.trim().toLowerCase();

  const sections: Section[] = useMemo(() => {
    const tagSections = [...tagsByCategory.entries()].map(([category, tags]) => ({
      key: `tag:${category}`,
      label: category,
      items: tags.map((t) => ({ id: t.slug, label: t.name, selected: selectedTagSlugs.includes(t.slug) })),
    }));
    return [
      ...tagSections,
      {
        key: DURATION_SECTION_KEY,
        label: "Duration",
        items: durationOptions.map((d) => ({
          id: d.value,
          label: d.label,
          selected: selectedDurationValues.includes(d.value),
        })),
      },
    ];
  }, [tagsByCategory, durationOptions, selectedTagSlugs, selectedDurationValues]);

  function toggle(sectionKey: string, id: string) {
    if (sectionKey === DURATION_SECTION_KEY) onToggleDuration(id);
    else onToggleTag(id);
  }

  const pinned = sections.flatMap((s) =>
    s.items.filter((i) => i.selected).map((i) => ({ ...i, sectionKey: s.key }))
  );

  return (
    <div className="flex flex-col gap-2 rounded border border-border p-2">
      {pinned.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {pinned.map((item) => (
            <button
              key={`${item.sectionKey}:${item.id}`}
              type="button"
              disabled={disabled}
              onClick={() => toggle(item.sectionKey, item.id)}
              aria-label={`Remove ${item.label}`}
              className="inline-flex items-center gap-1 rounded bg-accent/15 px-2 py-1 text-xs text-accent-hover hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.label} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}

      <Input
        placeholder="Filter tags/duration..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-56"
      />

      <div className="flex flex-col divide-y divide-border">
        {sections.map((section) => {
          const matches = query ? section.items.filter((i) => i.label.toLowerCase().includes(query)) : section.items;
          if (query && matches.length === 0) return null;
          const selectedCount = section.items.filter((i) => i.selected).length;
          const open =
            expandedOverride[section.key] ?? (query ? matches.length > 0 : selectedCount > 0);
          return (
            <div key={section.key} className="py-1">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs font-medium text-foreground"
                onClick={() => setExpandedOverride((prev) => ({ ...prev, [section.key]: !open }))}
                aria-expanded={open}
              >
                <span>{section.label}</span>
                <span className="flex items-center gap-2 text-muted">
                  {!open && selectedCount > 0 && <Badge tone="info">{selectedCount} selected</Badge>}
                  <span aria-hidden>{open ? "−" : "+"}</span>
                </span>
              </button>
              {open && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 py-1 pl-2">
                  {matches.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        disabled={disabled}
                        onChange={() => toggle(section.key, item.id)}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
