"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Badge from "@/components/ui/Badge";
import {
  PARTNER_PLACEMENTS,
  PARTNER_SCOPES,
  PLACEMENT_META,
  isHttpUrl,
  type PartnerLinkSlot,
  type PartnerLinksConfig,
  type PartnerPlacement,
  type PartnerScope,
} from "@/lib/partnerLinksConfig";

type CategoryOption = { slug: string; label: string };
type ProgramOption = { id: string; name: string };

function newSlot(placement: PartnerPlacement): PartnerLinkSlot {
  const meta = PLACEMENT_META[placement];
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `slot-${Date.now()}`,
    placement,
    enabled: false,
    header: "",
    description: "",
    label: meta.defaultLabel,
    url: "",
    showDisclosure: meta.defaultShowDisclosure,
    scope: "all",
    scopeValues: [],
  };
}

/** A slot's url is invalid only when non-empty and not http(s) -- a blank draft url is
 * allowed (the slot simply won't render). Mirrors the server schema's refinement. */
function slotUrlInvalid(slot: PartnerLinkSlot): boolean {
  return slot.url.trim().length > 0 && !isHttpUrl(slot.url);
}

export default function PartnerLinksManager({
  initialConfig,
  categoryOptions,
  programOptions,
}: {
  initialConfig: PartnerLinksConfig;
  categoryOptions: CategoryOption[];
  programOptions: ProgramOption[];
}) {
  const router = useRouter();
  const [slots, setSlots] = useState<PartnerLinkSlot[]>(initialConfig.slots);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const anyUrlInvalid = useMemo(() => slots.some(slotUrlInvalid), [slots]);

  function updateSlot(id: string, patch: Partial<PartnerLinkSlot>) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setSavedAt(null);
  }

  function changePlacement(id: string, placement: PartnerPlacement) {
    const allowsScoping = PLACEMENT_META[placement].allowsScoping;
    updateSlot(id, {
      placement,
      // Placements without scoping are `all`-only -- reset scope/values so a stale
      // program/category scope can't linger and be rejected on save.
      ...(allowsScoping ? {} : { scope: "all" as PartnerScope, scopeValues: [] }),
    });
  }

  function removeSlot(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
    setSavedAt(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/partner-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save partner links");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      {slots.length === 0 && (
        <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted">
          No partner links configured. Add one below — it stays off until you enable it and give it a
          working link.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {slots.map((slot) => {
          const meta = PLACEMENT_META[slot.placement];
          const urlInvalid = slotUrlInvalid(slot);
          return (
            <div key={slot.id} className="flex flex-col gap-3 rounded border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={slot.enabled ? "primary" : "secondary"}
                    onClick={() => updateSlot(slot.id, { enabled: !slot.enabled })}
                  >
                    {slot.enabled ? "Enabled" : "Disabled"}
                  </Button>
                  <span className="text-xs text-muted">Off by default — enable to show.</span>
                </div>
                <Button type="button" size="sm" variant="destructive" onClick={() => removeSlot(slot.id)}>
                  Remove
                </Button>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground">Placement</span>
                <Select
                  value={slot.placement}
                  onChange={(e) => changePlacement(slot.id, e.target.value as PartnerPlacement)}
                >
                  {PARTNER_PLACEMENTS.map((p) => (
                    <option key={p} value={p}>
                      {PLACEMENT_META[p].label}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-muted">Shows: {meta.label}</span>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground">Header (optional)</span>
                <Input
                  value={slot.header}
                  maxLength={60}
                  onChange={(e) => updateSlot(slot.id, { header: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground">Description (optional)</span>
                <Textarea
                  value={slot.description}
                  maxLength={200}
                  rows={2}
                  onChange={(e) => updateSlot(slot.id, { description: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground">Button label</span>
                <Input
                  value={slot.label}
                  maxLength={60}
                  onChange={(e) => updateSlot(slot.id, { label: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground">Link URL (http/https)</span>
                <Input
                  value={slot.url}
                  placeholder="https://israeltrack.example/mentor"
                  onChange={(e) => updateSlot(slot.id, { url: e.target.value })}
                />
                {urlInvalid && (
                  <span className="text-xs text-danger">URL must start with http:// or https://</span>
                )}
                <span className="text-xs text-muted">
                  Leave blank to keep this slot from rendering (a draft).
                </span>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={slot.showDisclosure}
                  onChange={(e) => updateSlot(slot.id, { showDisclosure: e.target.checked })}
                  className="accent-accent"
                />
                <span className="text-foreground">
                  Show disclosure (&ldquo;IsraelTrack is an independent partner…&rdquo;)
                </span>
              </label>

              {meta.allowsScoping ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground">Who sees it</span>
                  <Select
                    value={slot.scope}
                    onChange={(e) =>
                      updateSlot(slot.id, { scope: e.target.value as PartnerScope, scopeValues: [] })
                    }
                  >
                    {PARTNER_SCOPES.map((s) => (
                      <option key={s} value={s}>
                        {s === "all" ? "All programs" : s === "categories" ? "Programs in categories" : "Specific programs"}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : (
                <p className="text-xs text-muted">This placement applies to all programs.</p>
              )}

              {meta.allowsScoping && slot.scope === "categories" && (
                <ScopePicker
                  legend="Categories"
                  options={categoryOptions.map((c) => ({ value: c.slug, label: c.label }))}
                  selected={slot.scopeValues}
                  onChange={(scopeValues) => updateSlot(slot.id, { scopeValues })}
                />
              )}
              {meta.allowsScoping && slot.scope === "programs" && (
                <ScopePicker
                  legend="Programs"
                  searchable
                  options={programOptions.map((p) => ({ value: p.id, label: p.name }))}
                  selected={slot.scopeValues}
                  onChange={(scopeValues) => updateSlot(slot.id, { scopeValues })}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => setSlots((p) => [...p, newSlot("PROGRAM_NO_REFERENCES")])}>
          Add partner link
        </Button>
        <Button type="button" size="sm" disabled={saving || anyUrlInvalid} onClick={handleSave}>
          {saving ? "Saving..." : "Save all"}
        </Button>
        {anyUrlInvalid && <span className="text-xs text-danger">Fix invalid URLs before saving.</span>}
        {savedAt && <span className="text-xs text-muted">Saved.</span>}
      </div>
    </div>
  );
}

/** A compact multi-select of scope values (category slugs or program ids), reusing the
 * search + scrollable checkbox list + selected-badge pattern from the admin bulk-assign
 * tool rather than inventing a new control. */
function ScopePicker({
  legend,
  options,
  selected,
  onChange,
  searchable = false,
}: {
  legend: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = new Set(selected);
  const filtered = searchable && query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;
  const labelByValue = new Map(options.map((o) => [o.value, o.label]));

  function toggle(value: string) {
    onChange(selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-border p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{legend}</span>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((value) => (
            <Badge key={value} tone="neutral">
              <span className="flex items-center gap-1">
                {labelByValue.get(value) ?? value}
                <button
                  type="button"
                  aria-label={`Remove ${labelByValue.get(value) ?? value}`}
                  className="text-muted hover:text-danger"
                  onClick={() => toggle(value)}
                >
                  <X width={16} height={16} strokeWidth={1.5} />
                </button>
              </span>
            </Badge>
          ))}
        </div>
      )}
      {searchable && (
        <Input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className="max-h-48 overflow-y-auto rounded border border-border">
        {filtered.length === 0 ? (
          <p className="p-2 text-xs text-muted">No matches.</p>
        ) : (
          filtered.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-surface-muted">
              <input
                type="checkbox"
                checked={selectedSet.has(o.value)}
                onChange={() => toggle(o.value)}
                className="accent-accent"
              />
              <span className="text-foreground">{o.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
