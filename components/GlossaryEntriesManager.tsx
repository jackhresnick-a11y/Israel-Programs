"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  glossaryEntryKindSchema,
  glossaryEntriesSchema,
  type GlossaryEntry,
  type GlossaryEntryKind,
} from "@/lib/glossaryContent";

/** Client-only editing shape -- alsoKnownAs/related are edited as raw comma-separated
 * text rather than derived live from the array on every keystroke, so a trailing ", "
 * mid-typing doesn't get silently collapsed away by an immediate array<->string
 * round-trip. Converted back to string[] only in buildPayload, right before submit.
 * `uid` is a client-only stable identity (never sent to the API) -- entries are
 * reordered in place by moveEntry, so per-entry save/dirty/error state keyed by array
 * index would silently follow the wrong entry after a reorder. */
type EditableEntry = GlossaryEntry & { uid: string; alsoKnownAsText: string; relatedText: string };

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `g${uidCounter}`;
}

function toEditable(entry: GlossaryEntry): EditableEntry {
  return {
    ...entry,
    uid: nextUid(),
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
  return entries.map((entry) => ({
    slug: entry.slug,
    term: entry.term,
    termHe: entry.termHe,
    kind: entry.kind,
    summary: entry.summary,
    sections: entry.sections,
    programLinks: entry.programLinks,
    published: entry.published,
    alsoKnownAs: parseList(entry.alsoKnownAsText),
    related: parseList(entry.relatedText),
  }));
}

/** Stable, key-sorted serialization so the dirty check compares VALUES, not key order
 * or optional-vs-empty-array representation -- `initial` comes from the server via
 * glossaryEntriesSchema.parse (optional fields may be entirely absent), while
 * buildPayload always emits alsoKnownAs/related as arrays (possibly empty). */
function canonical(entry: GlossaryEntry): string {
  const normalized = {
    ...entry,
    termHe: entry.termHe ?? null,
    alsoKnownAs: entry.alsoKnownAs ?? [],
    related: entry.related ?? [],
    published: entry.published !== false,
  };
  return JSON.stringify(normalized, Object.keys(normalized).sort());
}

function blankEntry(kind: GlossaryEntryKind): EditableEntry {
  return {
    uid: nextUid(),
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

const FIELD_LABELS: Record<string, string> = {
  slug: "Slug",
  term: "Term",
  termHe: "Hebrew name",
  alsoKnownAs: "Also known as",
  kind: "Kind",
  summary: "Summary",
  sections: "Sections",
  programLinks: "Program links",
  related: "Related entry slugs",
  published: "Published",
};

/** Turns a zod issue path like ["sections", 2, "body"] into "Sections 3 → body" --
 * readable enough to point an admin at the right field without them having to guess
 * from a bare validation message. */
function describePath(path: (string | number)[]): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    if (typeof segment === "number") {
      parts[parts.length - 1] = `${parts[parts.length - 1]} ${segment + 1}`;
      continue;
    }
    parts.push(FIELD_LABELS[segment] ?? segment);
  }
  return parts.join(" → ");
}

export default function GlossaryEntriesManager({ initial }: { initial: GlossaryEntry[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [entries, setEntries] = useState<EditableEntry[]>(() => initial.map(toEditable));
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [errorsByUid, setErrorsByUid] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => buildPayload(entries), [entries]);
  const baseline = useMemo(() => initial.map(canonical), [initial]);
  const dirtyFlags = payload.map((e, i) => canonical(e) !== baseline[i]);
  const dirtyCount = dirtyFlags.filter(Boolean).length;
  const anyDirty = dirtyCount > 0 || payload.length !== initial.length;

  // Warn before an accidental refresh/close discards unsaved typing -- the bug this
  // whole component change exists to fix.
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

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

  /** Single save path used by every per-entry Save button AND the bottom "Save all"
   * button (originUid null), so the two can't drift. The API is a whole-array replace
   * over one SiteContent JSON blob (see app/api/admin/glossary/route.ts), so any save
   * -- from any entry -- persists every entry's current edits; that's surfaced to the
   * admin via a note in the UI rather than hidden. Validates client-side first with
   * the same glossaryEntriesSchema the API uses, so a bad entry is flagged on itself
   * instead of producing an off-screen, pathless 400. */
  async function save(originUid: string | null) {
    setSavingUid(originUid ?? "__all__");
    setError(null);
    setErrorsByUid({});

    const parsed = glossaryEntriesSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: Record<string, string[]> = {};
      let firstUid: string | null = null;
      for (const issue of parsed.error.issues) {
        const entryIndex = typeof issue.path[0] === "number" ? issue.path[0] : null;
        const entry = entryIndex !== null ? entries[entryIndex] : undefined;
        const uid = entry?.uid;
        const label = describePath(issue.path.slice(1).map((p) => p as string | number));
        const message = label ? `${label}: ${issue.message}` : issue.message;
        if (uid) {
          nextErrors[uid] = [...(nextErrors[uid] ?? []), message];
          firstUid ??= uid;
        } else {
          setError(issue.message);
        }
      }
      setErrorsByUid(nextErrors);
      setSavingUid(null);
      if (firstUid) {
        document.getElementById(`glossary-entry-${firstUid}`)?.scrollIntoView?.({ block: "center" });
      }
      return;
    }

    try {
      const res = await fetch("/api/admin/glossary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: parsed.data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save");
      }
      toast("Glossary saved");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      if (originUid) {
        setErrorsByUid({ [originUid]: [message] });
      } else {
        setError(message);
      }
    } finally {
      setSavingUid(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save(null);
  }

  const withIndex = entries.map((entry, index) => ({ entry, index, dirty: dirtyFlags[index] }));
  const terms = withIndex.filter(({ entry }) => entry.kind === "term");
  const comparisons = withIndex.filter(({ entry }) => entry.kind === "comparison");

  function renderEntry(
    { entry, index, dirty }: { entry: EditableEntry; index: number; dirty: boolean },
    groupPos: number,
    groupLength: number
  ) {
    const entryErrors = errorsByUid[entry.uid] ?? [];
    return (
      <div
        key={entry.uid}
        id={`glossary-entry-${entry.uid}`}
        className="flex flex-col gap-3 rounded border border-border p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            {entry.term || "(untitled entry)"}
            {entry.published === false && (
              <span className="rounded bg-warning-bg px-2 py-0.5 text-xs text-warning">Unpublished</span>
            )}
            {dirty && <Badge tone="info">Unsaved</Badge>}
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

        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              disabled={savingUid !== null}
              onClick={() => save(entry.uid)}
            >
              {savingUid === entry.uid ? "Saving…" : "Save"}
            </Button>
            {!dirty && <span className="text-xs text-muted">Saved.</span>}
          </div>
          {entryErrors.map((msg) => (
            <p key={msg} className="text-xs text-danger">
              {msg}
            </p>
          ))}
          <p className="text-xs text-muted">
            The glossary saves as one document, so this saves every change on this page.
          </p>
        </div>
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

      {/* Kept in the DOM (not omitted) so Enter-to-submit still works while dirty --
          just visually hidden so it never repeats the sticky bar's identical label on
          screen at the same time. */}
      <Button type="submit" disabled={savingUid !== null} className={anyDirty ? "sr-only" : "w-fit"}>
        {savingUid === "__all__" ? "Saving…" : "Save all changes"}
      </Button>

      {anyDirty && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3">
          <span className="text-sm text-muted">
            {dirtyCount} {dirtyCount === 1 ? "entry has" : "entries have"} unsaved changes
          </span>
          <Button type="button" disabled={savingUid !== null} onClick={() => save(null)}>
            {savingUid === "__all__" ? "Saving…" : "Save all changes"}
          </Button>
        </div>
      )}
    </form>
  );
}
