"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import TagPicker, { type TagOption, type TagCategoryOption } from "@/components/ui/TagPicker";
import Textarea from "@/components/ui/Textarea";
import { programMatchesTagFilter } from "@/lib/adminFilters";
import { countWords, MAX_TRANSCRIPT_CHARS } from "@/lib/transcriptsShared";
import {
  TAG_PROVENANCE_SOURCES,
  TAG_PROVENANCE_SOURCE_LABELS,
  resolveSource,
  type TagProvenanceSource,
} from "@/lib/tagProvenanceShared";

export type ContactOptInRow = {
  contactName: string;
  contactMethod: string;
  contactOptInAt: Date;
  contactAgeAttestedAt: Date;
};

export type ProgramTagProvenanceRow = {
  tagId: string;
  source: TagProvenanceSource;
  sourceUrl: string | null;
  note: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
};

export type ProgramRow = {
  id: string;
  name: string;
  slug: string;
  organization: string | null;
  location: string | null;
  tags: { id: string; slug: string; name: string }[];
  provenance: ProgramTagProvenanceRow[];
  responseCount: number;
  bestForPhrases: string[];
  editorialBestFor: string | null;
  contactOptIns: ContactOptInRow[];
  videoUrl: string | null;
  videoCredit: string | null;
  videoCreditUrl: string | null;
  videoTranscript: string | null;
  aiBrief: string | null;
  transcriptTags: string[];
};

export type TagProvenanceBacklogRow = { programId: string; unprovenancedCount: number };

export type UnusedTagRow = { id: string; name: string; slug: string };

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

function ProgramRowCard({
  program,
  allTags,
  categories,
  unprovenancedCount,
}: {
  program: ProgramRow;
  allTags: TagOption[];
  categories: TagCategoryOption[];
  unprovenancedCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorialBestFor, setEditorialBestFor] = useState(program.editorialBestFor ?? "");
  const [tagsValue, setTagsValue] = useState(program.tags.map((t) => t.name).join(", "));
  const [videoUrl, setVideoUrl] = useState(program.videoUrl ?? "");
  const [videoCredit, setVideoCredit] = useState(program.videoCredit ?? "");
  const [videoCreditUrl, setVideoCreditUrl] = useState(program.videoCreditUrl ?? "");
  const [aiBrief, setAiBrief] = useState(program.aiBrief ?? "");
  const [videoTranscript, setVideoTranscript] = useState(program.videoTranscript ?? "");
  const [transcriptUploadError, setTranscriptUploadError] = useState<string | null>(null);
  const [tagBusy, setTagBusy] = useState<string | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [generateBriefError, setGenerateBriefError] = useState<string | null>(null);

  const provenanceByTagId = useMemo(() => {
    const map = new Map<string, ProgramTagProvenanceRow>();
    for (const row of program.provenance) map.set(row.tagId, row);
    return map;
  }, [program.provenance]);

  const [provenanceDrafts, setProvenanceDrafts] = useState<
    Record<string, { source: TagProvenanceSource; sourceUrl: string; note: string }>
  >(() => {
    const drafts: Record<string, { source: TagProvenanceSource; sourceUrl: string; note: string }> = {};
    for (const tag of program.tags) {
      const row = provenanceByTagId.get(tag.id) ?? null;
      drafts[tag.id] = {
        source: resolveSource(row),
        sourceUrl: row?.sourceUrl ?? "",
        note: row?.note ?? "",
      };
    }
    return drafts;
  });
  const [provenanceBusyTagId, setProvenanceBusyTagId] = useState<string | null>(null);
  const [provenanceErrors, setProvenanceErrors] = useState<Record<string, string>>({});

  function setProvenanceDraft(tagId: string, patch: Partial<{ source: TagProvenanceSource; sourceUrl: string; note: string }>) {
    setProvenanceDrafts((prev) => ({ ...prev, [tagId]: { ...prev[tagId], ...patch } }));
  }

  async function handleSaveProvenance(tagId: string) {
    const draft = provenanceDrafts[tagId];
    if (!draft) return;
    setProvenanceBusyTagId(tagId);
    setProvenanceErrors((prev) => ({ ...prev, [tagId]: "" }));
    try {
      await api(`/api/admin/programs/${program.id}/tag-provenance`, "PATCH", {
        tagId,
        source: draft.source,
        sourceUrl: draft.sourceUrl.trim(),
        note: draft.note.trim(),
      });
      router.refresh();
    } catch (err) {
      setProvenanceErrors((prev) => ({
        ...prev,
        [tagId]: err instanceof Error ? err.message : "Failed to save provenance",
      }));
    } finally {
      setProvenanceBusyTagId(null);
    }
  }

  const aiBriefWordCount = aiBrief.trim() ? aiBrief.trim().split(/\s+/).length : 0;
  const transcriptWordCount = countWords(videoTranscript);

  async function handleTranscriptFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setTranscriptUploadError(null);
    const text = await file.text();
    if (text.length > MAX_TRANSCRIPT_CHARS) {
      setTranscriptUploadError(
        `Transcript is ${text.length.toLocaleString()} characters, over the ${MAX_TRANSCRIPT_CHARS.toLocaleString()} limit.`
      );
      return;
    }
    setVideoTranscript(text);
  }

  async function handleGenerateBrief() {
    setGeneratingBrief(true);
    setGenerateBriefError(null);
    try {
      const { brief } = await api(`/api/admin/programs/${program.id}/generate-brief`, "POST");
      setAiBrief(brief);
    } catch (err) {
      setGenerateBriefError(err instanceof Error ? err.message : "Failed to generate a brief");
    } finally {
      setGeneratingBrief(false);
    }
  }

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
        api(`/api/admin/programs/${program.id}/video`, "PATCH", {
          videoUrl: videoUrl.trim() || null,
          videoCredit: videoCredit.trim() || null,
          videoCreditUrl: videoCreditUrl.trim() || null,
          videoTranscript: videoTranscript.trim() || null,
          aiBrief: aiBrief.trim() || null,
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

  async function handleArchive() {
    if (!confirm(`Archive "${program.name}"? It will disappear from browse, search, and the sitemap. Poll responses and outreach history are kept.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/programs/${program.id}/archive`, "POST");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive");
      setBusy(false);
    }
  }

  async function handleTranscriptTagDecision(slug: string, action: "approve" | "reject") {
    setTagBusy(slug);
    setError(null);
    try {
      await api(`/api/admin/programs/${program.id}/transcript-tags`, "POST", { slug, action });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update suggested tag");
    } finally {
      setTagBusy(null);
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
        {program.contactOptIns.length > 0 && (
          <Badge tone="info">
            {program.contactOptIns.length} open to contact
          </Badge>
        )}
        {unprovenancedCount > 0 && (
          <Badge tone="warning">
            {unprovenancedCount} unprovenanced tag{unprovenancedCount === 1 ? "" : "s"}
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted">
          {program.responseCount} response{program.responseCount === 1 ? "" : "s"}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Edit"}
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={handleArchive}>
          Archive
        </Button>
      </div>

      <p className="text-xs text-muted">
        {strip ? <span className="text-foreground">{strip}</span> : "(no strip — fewer than 2 eligible questions)"}
      </p>

      <div className="flex flex-wrap gap-1">
        {program.tags.map((t) => (
          <Badge key={t.slug} tone="tag">
            {t.name}
          </Badge>
        ))}
      </div>

      {error && <p className="rounded bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

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

          <div className="flex flex-col gap-2 rounded border border-border bg-surface-muted p-3">
            <p className="text-xs font-semibold text-muted">
              Suggested from transcript — nothing is applied until you approve
            </p>
            {program.transcriptTags.length === 0 ? (
              <p className="text-xs text-muted">No suggested tags.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {program.transcriptTags.map((slug) => {
                  const match = allTags.find((t) => t.slug === slug);
                  return (
                    <div key={slug} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 text-foreground">
                        {match ? match.name : <span className="italic text-muted">{slug} (no matching tag)</span>}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={tagBusy === slug || !match}
                        onClick={() => handleTranscriptTagDecision(slug, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={tagBusy === slug}
                        onClick={() => handleTranscriptTagDecision(slug, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Tags
            <TagPicker value={tagsValue} onChange={setTagsValue} allTags={allTags} categories={categories} />
          </label>

          {program.tags.length > 0 && (
            <div className="flex flex-col gap-2 rounded border border-border p-3">
              <p className="text-xs font-semibold text-muted">
                Tag provenance — admin only, never shown publicly
              </p>
              <div className="flex flex-col divide-y divide-border">
                {program.tags.map((tag) => {
                  const draft = provenanceDrafts[tag.id];
                  const savedRow = provenanceByTagId.get(tag.id);
                  if (!draft) return null;
                  return (
                    <div key={tag.id} className="flex flex-col gap-1 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{tag.name}</span>
                        <select
                          aria-label={`Source for ${tag.name}`}
                          value={draft.source}
                          onChange={(e) =>
                            setProvenanceDraft(tag.id, { source: e.target.value as TagProvenanceSource })
                          }
                          className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                        >
                          {TAG_PROVENANCE_SOURCES.map((s) => (
                            <option key={s} value={s}>
                              {TAG_PROVENANCE_SOURCE_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        <Input
                          aria-label={`Source URL for ${tag.name}`}
                          value={draft.sourceUrl}
                          onChange={(e) => setProvenanceDraft(tag.id, { sourceUrl: e.target.value })}
                          placeholder="https://... (optional)"
                          className="max-w-xs text-xs"
                        />
                        <Input
                          aria-label={`Note for ${tag.name}`}
                          value={draft.note}
                          onChange={(e) => setProvenanceDraft(tag.id, { note: e.target.value })}
                          placeholder="Note (optional)"
                          className="max-w-xs text-xs"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={provenanceBusyTagId === tag.id}
                          onClick={() => handleSaveProvenance(tag.id)}
                        >
                          {provenanceBusyTagId === tag.id ? "Saving..." : "Save"}
                        </Button>
                      </div>
                      {savedRow?.verifiedAt && (
                        <p className="text-[11px] text-muted">
                          Last recorded {new Date(savedRow.verifiedAt).toLocaleDateString()}
                          {savedRow.verifiedBy ? ` by ${savedRow.verifiedBy}` : ""}
                        </p>
                      )}
                      {provenanceErrors[tag.id] && (
                        <p className="text-[11px] text-danger">{provenanceErrors[tag.id]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs text-muted">
            Video URL
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
              Video credit (public — e.g. &ldquo;@handle&rdquo;, hidden when blank)
              <Input
                value={videoCredit}
                onChange={(e) => setVideoCredit(e.target.value)}
                placeholder="Video by..."
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
              Video credit link (optional)
              <Input
                value={videoCreditUrl}
                onChange={(e) => setVideoCreditUrl(e.target.value)}
                placeholder="https://..."
              />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span>AI brief ({aiBriefWordCount} word{aiBriefWordCount === 1 ? "" : "s"}, target ~80) — public</span>
              {program.videoTranscript && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={generatingBrief}
                  onClick={handleGenerateBrief}
                >
                  {generatingBrief ? "Generating..." : "Generate from transcript"}
                </Button>
              )}
            </div>
            <Textarea
              aria-label="AI brief"
              value={aiBrief}
              onChange={(e) => setAiBrief(e.target.value)}
              rows={3}
              placeholder="A short distilled summary, e.g. from the video transcript below"
            />
            {generateBriefError && (
              <p className="rounded bg-danger-bg px-3 py-2 text-xs text-danger">{generateBriefError}</p>
            )}
            {program.videoTranscript && (
              <p className="text-[11px] text-muted">
                Draft only — review and edit above, then press Save. Nothing is written until you save.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span>
                Transcript (admin only — never shown publicly) — {transcriptWordCount} word
                {transcriptWordCount === 1 ? "" : "s"}
              </span>
              <label className="cursor-pointer text-accent-hover underline">
                Upload .txt
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={(e) => {
                    handleTranscriptFile(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
            </div>
            <Textarea
              value={videoTranscript}
              onChange={(e) => setVideoTranscript(e.target.value)}
              rows={8}
              placeholder="Raw video transcript, or upload a .txt file above"
            />
            {transcriptUploadError && (
              <p className="rounded bg-danger-bg px-3 py-2 text-xs text-danger">{transcriptUploadError}</p>
            )}
          </div>
          <Button type="button" size="sm" className="self-start" disabled={busy} onClick={handleSave}>
            {busy ? "Saving..." : "Save"}
          </Button>
          {program.contactOptIns.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted">
                Open to contact ({program.contactOptIns.length}) — never shown publicly
              </p>
              <div className="flex flex-col divide-y divide-border rounded border border-border">
                {program.contactOptIns.map((c, i) => (
                  <div key={i} className="flex flex-col gap-1 px-3 py-2 text-xs">
                    <span className="font-medium text-foreground">{c.contactName}</span>
                    <span className="text-muted">{c.contactMethod}</span>
                    <span className="text-muted">
                      Consented {new Date(c.contactOptInAt).toLocaleDateString()} · 18+ attested{" "}
                      {new Date(c.contactAgeAttestedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
  provenanceBacklog,
  unusedTags,
}: {
  programs: ProgramRow[];
  allTags: TagOption[];
  categories: TagCategoryOption[];
  provenanceBacklog: { totalPairs: number; unprovenancedPairs: number; programs: TagProvenanceBacklogRow[] };
  unusedTags: UnusedTagRow[];
}) {
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [tagFilterSearch, setTagFilterSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [needsProvenanceOnly, setNeedsProvenanceOnly] = useState(false);

  const backlogByProgramId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of provenanceBacklog.programs) map.set(row.programId, row.unprovenancedCount);
    return map;
  }, [provenanceBacklog.programs]);

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
    if (needsProvenanceOnly) {
      result = result.filter((p) => (backlogByProgramId.get(p.id) ?? 0) > 0);
    }
    const sorted = [...result].sort((a, b) => {
      const cmp = sortKey === "name" ? a.name.localeCompare(b.name) : a.responseCount - b.responseCount;
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [programs, search, selectedTags, sortKey, sortAsc, needsProvenanceOnly, backlogByProgramId]);

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
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted">
            <span className="font-semibold text-foreground">{provenanceBacklog.unprovenancedPairs}</span> of{" "}
            {provenanceBacklog.totalPairs} tag pairs have no recorded source
          </p>
          <label className="flex items-center gap-1 text-xs text-muted">
            <input
              type="checkbox"
              checked={needsProvenanceOnly}
              onChange={(e) => setNeedsProvenanceOnly(e.target.checked)}
              className="accent-accent"
            />
            Needs provenance only
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            placeholder={`Search ${programs.length} programs by name or slug...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant={sortKey === "name" ? "primary" : "secondary"}
              size="sm"
              onClick={() => toggleSort("name")}
            >
              Name
              {sortKey === "name" &&
                (sortAsc ? (
                  <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
                ))}
            </Button>
            <Button
              type="button"
              variant={sortKey === "responseCount" ? "primary" : "secondary"}
              size="sm"
              onClick={() => toggleSort("responseCount")}
            >
              Responses
              {sortKey === "responseCount" &&
                (sortAsc ? (
                  <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
                ))}
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
                    <button
                      type="button"
                      onClick={() => toggleTagFilter(slug)}
                      aria-label={`Remove ${tag?.name ?? slug}`}
                      className="ml-1 hover:text-danger"
                    >
                      <X width={16} height={16} strokeWidth={1.5} />
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
          <div className="max-h-32 overflow-y-auto rounded border border-border p-2">
            {filteredTagOptions.map((tag) => (
              <label key={tag.slug} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-foreground hover:bg-surface-muted">
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

      {unusedTags.length > 0 && (
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-xs font-semibold text-muted">
            Unused tags ({unusedTags.length}) — attached to zero programs, read-only cleanup list
          </p>
          <div className="flex flex-wrap gap-1">
            {unusedTags.map((tag) => (
              <Badge key={tag.id} tone="tag">
                {tag.name}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-col divide-y divide-border rounded border border-border">
        {filtered.map((program) => (
          <ProgramRowCard
            key={program.id}
            program={program}
            allTags={allTags}
            categories={categories}
            unprovenancedCount={backlogByProgramId.get(program.id) ?? 0}
          />
        ))}
        {filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No programs match.</p>}
      </div>
    </div>
  );
}
