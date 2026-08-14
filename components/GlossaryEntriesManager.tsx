"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import Button from "@/components/ui/Button";
import {
  glossaryEntryKindSchema,
  type GlossaryEntry,
  type GlossaryEntryKind,
} from "@/lib/glossaryContent";

/** Client-only editing shape -- alsoKnownAs/related are edited as raw comma-separated
 * text rather than derived live from the array on every keystroke, so a trailing ", "
 * mid-typing doesn't get silently collapsed away by an immediate array<->string
 * round-trip. Converted back to string[] only in buildPayload, right before submit. */
type EditableEntry = GlossaryEntry & { alsoKnownAsText: string; relatedText: string };

function toEditable(entry: GlossaryEntry): EditableEntry {
  return {
    ...entry,
    alsoKnownAsText: (entry.alsoKnownAs ?? []).join(", "),
    relatedText: (entry.related ?? []).join(", "),
  };
}

function parseList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildPayload(entries: EditableEntry[]): GlossaryEntry[] {
  return entries.map(({ alsoKnownAsText, relatedText, ...entry }) => ({
    ...entry,
    alsoKnownAs: parseList(alsoKnownAsText),
    related: parseList(relatedText),
  }));
}

function blankEntry(kind: GlossaryEntryKind): EditableEntry {
  return {
    slug: "",
    term: "",
    termHe: null,
    alsoKnownAsText: "",
    kind,
    summary: "",
    sections: [{ heading: "", body: "" }],
    programLinks: [],
    relatedText: "",
    published: true,
  };
}

export default function GlossaryEntriesManager({ initial }: { initial: GlossaryEntry[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState<EditableEntry[]>(() => initial.map(toEditable));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof EditableEntry>(index: number, key: K, value: EditableEntry[K]) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [key]: value } : e)));
  }

  function addEntry(kind: GlossaryEntryKind) {
    setEntries((prev) => [...prev, blankEntry(kind)]);
  }

  /** Swaps with the adjacent entry of the SAME kind, not simply the adjacent array
   * index -- the public index groups Terms and Comparisons into separate lists, so
   * swapping past an entry of the other kind would reorder the underlying array with
   * no visible effect on either group. */
  function moveEntry(index: number, direction: -1 | 1) {
    setEntries((prev) => {
      const kind = prev[index].kind;
      const sameKindIndices = prev.reduce<number[]>(
        (acc, e, i) => (e.kind === kind ? [...acc, i] : acc),
        []
      );
      const posInGroup = sameKindIndices.indexOf(index);
      const targetPos = posInGroup + direction;
      if (targetPos < 0 || targetPos >= sameKindIndices.length) return prev;
      const targetIndex = sameKindIndices[targetPos];
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function updateSection(entryIndex: number, sectionIndex: number, key: "heading" | "body", value: string) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== entryIndex
          ? e
          : { ...e, sections: e.sections.map((s, j) => (j === sectionIndex ? { ...s, [key]: value } : s)) }
      )
    );
  }

  function addSection(entryIndex: number) {
    setEntries((prev) =>
      prev.map((e, i) => (i !== entryIndex ? e : { ...e, sections: [...e.sections, { heading: "", body: "" }] }))
    );
  }

  function removeSection(entryIndex: number, sectionIndex: number) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== entryIndex ? e : { ...e, sections: e.sections.filter((_, j) => j !== sectionIndex) }
      )
    );
  }

  function updateProgramLink(entryIndex: number, linkIndex: number, key: "label" | "href", value: string) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== entryIndex
          ? e
          : { ...e, programLinks: e.programLinks.map((l, j) => (j === linkIndex ? { ...l, [key]: value } : l)) }
      )
    );
  }

  function addProgramLink(entryIndex: number) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== entryIndex ? e : { ...e, programLinks: [...e.programLinks, { label: "", href: "/programs?" }] }
      )
    );
  }

  function removeProgramLink(entryIndex: number, linkIndex: number) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== entryIndex ? e : { ...e, programLinks: e.programLinks.filter((_, j) => j !== linkIndex) }
      )
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/glossary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: buildPayload(entries) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  const withIndex = entries.map((entry, index) => ({ entry, index }));
  const terms = withIndex.filter(({ entry }) => entry.kind === "term");
  const comparisons = withIndex.filter(({ entry }) => entry.kind === "comparison");

  function renderEntry({ entry, index }: { entry: EditableEntry; index: number }, groupPos: number, groupLength: number) {
    return (
      <div key={index} className="flex flex-col gap-3 rounded border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            {entry.term || "(untitled entry)"}
            {entry.published === false && (
              <span className="rounded bg-warning-bg px-2 py-0.5 text-xs text-warning">Unpublished</span>
            )}
          </span>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => moveEntry(index, -1)}
              disabled={groupPos === 0}
              className="text-muted hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Move up"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => moveEntry(index, 1)}
              disabled={groupPos === groupLength - 1}
              className="text-muted hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Move down"
            >
              <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Slug</span>
            <Input required value={entry.slug} onChange={(e) => update(index, "slug", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Term</span>
            <Input required value={entry.term} onChange={(e) => update(index, "term", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Hebrew name (optional)</span>
            <Input value={entry.termHe ?? ""} onChange={(e) => update(index, "termHe", e.target.value || null)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Kind</span>
            <Select
              value={entry.kind}
              onChange={(e) => update(index, "kind", glossaryEntryKindSchema.parse(e.target.value))}
            >
              <option value="term">Term</option>
              <option value="comparison">Comparison</option>
            </Select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Also known as (comma-separated, optional)</span>
          <Input
            value={entry.alsoKnownAsText}
            onChange={(e) => update(index, "alsoKnownAsText", e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Summary</span>
          <AutoGrowTextarea
            required
            minRows={2}
            value={entry.summary}
            onChange={(e) => update(index, "summary", e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={entry.published !== false}
            onChange={(e) => update(index, "published", e.target.checked)}
          />
          <span className="font-medium text-foreground">Published</span>
          <span className="text-xs text-muted">
            Unchecking hides just this entry from the public without touching the global switch above.
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Sections</span>
          {entry.sections.map((section, sIndex) => (
            <div key={sIndex} className="flex flex-col gap-2 rounded bg-surface-muted p-3">
              <div className="flex items-center justify-between gap-2">
                <Input
                  required
                  placeholder="Heading"
                  value={section.heading}
                  onChange={(e) => updateSection(index, sIndex, "heading", e.target.value)}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeSection(index, sIndex)}
                  disabled={entry.sections.length <= 1}
                  className="shrink-0 text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
              <AutoGrowTextarea
                required
                minRows={2}
                placeholder="Body"
                value={section.body}
                onChange={(e) => updateSection(index, sIndex, "body", e.target.value)}
              />
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => addSection(index)}>
            Add section
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">
            Program links (optional — a term can have none)
          </span>
          {entry.programLinks.map((link, lIndex) => (
            <div key={lIndex} className="flex items-center gap-2 rounded bg-surface-muted p-3">
              <Input
                required
                placeholder="Label"
                value={link.label}
                onChange={(e) => updateProgramLink(index, lIndex, "label", e.target.value)}
                className="flex-1"
              />
              <Input
                required
                placeholder="/programs?..."
                value={link.href}
                onChange={(e) => updateProgramLink(index, lIndex, "href", e.target.value)}
                className="flex-[2]"
              />
              <button
                type="button"
                onClick={() => removeProgramLink(index, lIndex)}
                className="shrink-0 text-danger hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => addProgramLink(index)}
          >
            Add program link
          </Button>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Related entry slugs (comma-separated, optional)</span>
          <Input value={entry.relatedText} onChange={(e) => update(index, "relatedText", e.target.value)} />
        </label>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && <p className="rounded bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold text-foreground">Terms</h2>
        {terms.map((item, groupPos) => renderEntry(item, groupPos, terms.length))}
        <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => addEntry("term")}>
          Add term
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold text-foreground">Comparisons</h2>
        {comparisons.map((item, groupPos) => renderEntry(item, groupPos, comparisons.length))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-fit"
          onClick={() => addEntry("comparison")}
        >
          Add comparison
        </Button>
      </div>

      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
