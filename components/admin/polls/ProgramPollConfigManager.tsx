"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { BucketRow } from "@/components/admin/polls/BucketManager";
import type { QuestionRow } from "@/components/admin/polls/QuestionManager";

export type PollProgramRow = {
  id: string;
  name: string;
  slug: string;
  config: {
    bucketIds: string[];
    addedQuestionIds: string[];
    removedQuestionIds: string[];
    resultsVisible: boolean;
    minResponsesToPublish: number;
    displayFormat: "STARS" | "PERCENT" | "BOTH";
    placeholderOverride: string | null;
    pollLinkPublic: boolean;
  };
  /** Bucket ids an ACTIVE BucketAttachmentRule additionally attaches here based on this
   * program's current tags -- see lib/pollConfig.ts's listProgramsWithPollConfig. Shown
   * as a read-only "Auto via rule" badge below since these arrive independently of
   * `config.bucketIds` (the manual checkboxes this component edits) and toggling a
   * checkbox off here can't detach one -- only retiring the rule or changing the
   * program's tags can. */
  ruleAttachedBucketIds: string[];
};

type TagOption = { slug: string; name: string };

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

function BulkAssignPanel({ buckets, tags }: { buckets: BucketRow[]; tags: TagOption[] }) {
  const router = useRouter();
  const [bucketId, setBucketId] = useState(buckets[0]?.id ?? "");
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [tagSearch, setTagSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ matchedPrograms: number; affected: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredTags = useMemo(() => {
    const term = tagSearch.trim().toLowerCase();
    if (!term) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(term) || t.slug.includes(term));
  }, [tags, tagSearch]);

  function toggleTag(slug: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function handleRun() {
    if (!bucketId || selectedTags.size === 0) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api("/api/admin/polls/programs/bulk-assign", "POST", {
        bucketId,
        tagSlugs: Array.from(selectedTags),
        mode,
      });
      setResult(res);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bulk-assign");
    } finally {
      setRunning(false);
    }
  }

  if (buckets.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted">
        No extra buckets exist yet -- create one under the Buckets tab before bulk-assigning.
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-foreground">Bulk-assign a bucket by tag</h2>
      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}
      {result && (
        <p className="rounded-lg bg-success-bg px-3 py-2 text-xs text-success">
          Matched {result.matchedPrograms} program{result.matchedPrograms === 1 ? "" : "s"} -- changed{" "}
          {result.affected} (the rest already had this bucket {mode === "add" ? "attached" : "detached"}).
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Bucket
          <Select value={bucketId} onChange={(e) => setBucketId(e.target.value)} className="w-56">
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Action
          <Select value={mode} onChange={(e) => setMode(e.target.value as "add" | "remove")} className="w-40">
            <option value="add">Attach to matching programs</option>
            <option value="remove">Detach from matching programs</option>
          </Select>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <Input
          placeholder="Search tags..."
          value={tagSearch}
          onChange={(e) => setTagSearch(e.target.value)}
          className="max-w-xs text-sm"
        />
        {selectedTags.size > 0 && (
          <div className="flex flex-wrap gap-1">
            {Array.from(selectedTags).map((slug) => (
              <Badge key={slug} tone="tag" className="gap-1">
                {slug}
                <button type="button" onClick={() => toggleTag(slug)} className="ml-0.5 hover:text-danger">
                  &times;
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-2">
          {filteredTags.map((tag) => (
            <label
              key={tag.slug}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs text-foreground hover:bg-surface-muted"
            >
              <input
                type="checkbox"
                checked={selectedTags.has(tag.slug)}
                onChange={() => toggleTag(tag.slug)}
                className="accent-accent"
              />
              {tag.name}
            </label>
          ))}
          {filteredTags.length === 0 && <p className="px-2 py-2 text-xs text-muted">No tags match.</p>}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        className="self-start"
        disabled={!bucketId || selectedTags.size === 0 || running}
        onClick={handleRun}
      >
        {running ? "Running..." : "Run bulk-assign"}
      </Button>
    </Card>
  );
}

function ProgramRow({ program, buckets, questions }: { program: PollProgramRow; buckets: BucketRow[]; questions: QuestionRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bucketIds, setBucketIds] = useState(new Set(program.config.bucketIds));
  const [addedQuestionIds, setAddedQuestionIds] = useState(new Set(program.config.addedQuestionIds));
  const [removedQuestionIds, setRemovedQuestionIds] = useState(new Set(program.config.removedQuestionIds));
  const [resultsVisible, setResultsVisible] = useState(program.config.resultsVisible);
  const [pollLinkPublic, setPollLinkPublic] = useState(program.config.pollLinkPublic);
  const [minResponses, setMinResponses] = useState(String(program.config.minResponsesToPublish));
  const [displayFormat, setDisplayFormat] = useState(program.config.displayFormat);
  const [placeholderOverride, setPlaceholderOverride] = useState(program.config.placeholderOverride ?? "");

  function toggleInSet(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/polls/programs/${program.id}`, "PATCH", {
        bucketIds: Array.from(bucketIds),
        addedQuestionIds: Array.from(addedQuestionIds),
        removedQuestionIds: Array.from(removedQuestionIds),
        resultsVisible,
        pollLinkPublic,
        minResponsesToPublish: Number(minResponses) || 1,
        displayFormat,
        placeholderOverride: placeholderOverride.trim() || null,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  /** One-click toggle for the single most-needed control on this row -- whether the
   * program's score AND approved reviews show on its public page -- without opening
   * the full Edit panel first. Only this one field is sent, via the same PATCH route
   * and partial-update schema handleSave uses, so it never clobbers unsaved edits to
   * buckets/questions sitting in the (possibly still-open) Edit panel below. Reverts
   * optimistic state on failure. */
  async function handleQuickToggleVisible() {
    const next = !resultsVisible;
    setResultsVisible(next);
    setToggling(true);
    setError(null);
    try {
      await api(`/api/admin/polls/programs/${program.id}`, "PATCH", { resultsVisible: next });
      router.refresh();
    } catch (err) {
      setResultsVisible(!next);
      setError(err instanceof Error ? err.message : "Failed to update visibility");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{program.name}</span>
        <button
          type="button"
          onClick={handleQuickToggleVisible}
          disabled={toggling}
          title="Click to toggle whether this program's score and approved reviews show on its public page"
          className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Badge tone={resultsVisible ? "success" : "neutral"}>
            {toggling ? "Updating..." : resultsVisible ? "Results visible ✓" : "Results hidden -- click to show"}
          </Badge>
        </button>
        {program.config.pollLinkPublic && <Badge tone="info">Public link</Badge>}
        {program.ruleAttachedBucketIds.length > 0 && (
          <Badge tone="info">
            +{program.ruleAttachedBucketIds.length} via rule
          </Badge>
        )}
        <span className="text-xs text-muted">
          min {program.config.minResponsesToPublish} · {program.config.displayFormat.toLowerCase()} ·{" "}
          {program.config.bucketIds.length} extra bucket{program.config.bucketIds.length === 1 ? "" : "s"}
        </span>
        <Button type="button" variant="secondary" size="sm" className="ml-auto" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Edit"}
        </Button>
      </div>

      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

      {open && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={resultsVisible}
                onChange={(e) => setResultsVisible(e.target.checked)}
                className="accent-accent"
              />
              Results visible
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={pollLinkPublic}
                onChange={(e) => setPollLinkPublic(e.target.checked)}
                className="accent-accent"
              />
              Public poll link (visitors can share/open this program&rsquo;s poll)
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Min responses to publish
              <Input
                type="number"
                min={1}
                value={minResponses}
                onChange={(e) => setMinResponses(e.target.value)}
                className="w-24"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Display format
              <Select value={displayFormat} onChange={(e) => setDisplayFormat(e.target.value as typeof displayFormat)} className="w-32">
                <option value="STARS">Stars</option>
                <option value="PERCENT">Percent</option>
                <option value="BOTH">Both</option>
              </Select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Placeholder override (replaces the empty-state copy for this program)
            <Input
              value={placeholderOverride}
              onChange={(e) => setPlaceholderOverride(e.target.value)}
              placeholder="Leave blank to use the default copy"
            />
          </label>

          <div>
            <p className="mb-1 text-xs font-semibold text-muted">Core bucket</p>
            <Badge tone="info">Always attached -- can&rsquo;t be removed</Badge>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-muted">Extra buckets</p>
            <div className="flex flex-col gap-1">
              {buckets.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={bucketIds.has(b.id)}
                    onChange={() => toggleInSet(bucketIds, setBucketIds, b.id)}
                    className="accent-accent"
                  />
                  {b.name}
                  {program.ruleAttachedBucketIds.includes(b.id) && (
                    <Badge tone="info" className="text-[10px]">
                      Auto via rule
                    </Badge>
                  )}
                </label>
              ))}
              {buckets.length === 0 && <p className="text-xs text-muted">No extra buckets exist yet.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold text-muted">Added questions (one-off, this program only)</p>
              <div className="flex flex-col gap-1">
                {questions.map((q) => (
                  <label key={q.id} className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={addedQuestionIds.has(q.id)}
                      onChange={() => toggleInSet(addedQuestionIds, setAddedQuestionIds, q.id)}
                      className="accent-accent"
                    />
                    {q.text}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted">Removed questions (suppress from this program)</p>
              <div className="flex flex-col gap-1">
                {questions.map((q) => (
                  <label key={q.id} className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={removedQuestionIds.has(q.id)}
                      onChange={() => toggleInSet(removedQuestionIds, setRemovedQuestionIds, q.id)}
                      className="accent-accent"
                    />
                    {q.text}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <Button type="button" size="sm" className="self-start" disabled={busy} onClick={handleSave}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </Card>
      )}
    </div>
  );
}

export default function ProgramPollConfigManager({
  programs,
  buckets,
  questions,
  tags,
}: {
  programs: PollProgramRow[];
  buckets: BucketRow[];
  questions: QuestionRow[];
  tags: TagOption[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return programs;
    return programs.filter((p) => p.name.toLowerCase().includes(term));
  }, [programs, search]);

  return (
    <div className="flex flex-col gap-6">
      <BulkAssignPanel buckets={buckets} tags={tags} />

      <Input
        placeholder={`Search ${programs.length} programs by name...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {filtered.map((program) => (
          <ProgramRow key={program.id} program={program} buckets={buckets} questions={questions} />
        ))}
        {filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No programs match.</p>}
      </div>
    </div>
  );
}
