"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { BucketRow } from "@/components/admin/polls/BucketManager";

export type BucketRuleRow = {
  id: string;
  bucketId: string;
  tagSlugs: string[];
  status: "ACTIVE" | "RETIRED";
  createdAt: Date;
};

type TagOption = { id: string; name: string; slug: string };
type PreviewResult = { matched: number; newlyAffected: number; sampleNames: string[] };

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

/**
 * The bucket + tag-condition picker shared by the create card and each rule's inline
 * edit form. Fetches a fresh "how many programs will this affect" preview every time the
 * bucket/tag selection changes, and Save stays disabled until a preview matching the
 * CURRENT selection has actually loaded -- per the build spec's "I don't want to
 * silently change 80 programs' polls," there is no code path that saves a rule without
 * the admin having seen this number first.
 */
function RuleForm({
  initial,
  buckets,
  tags,
  excludeRuleId,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
}: {
  initial?: BucketRuleRow;
  buckets: BucketRow[];
  tags: TagOption[];
  excludeRuleId?: string;
  onSubmit: (input: { bucketId: string; tagSlugs: string[] }) => void;
  onCancel?: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  const [bucketId, setBucketId] = useState(initial?.bucketId ?? "");
  const [tagSlugs, setTagSlugs] = useState<string[]>(initial?.tagSlugs ?? [""]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const selectedSlugs = tagSlugs.filter((s) => s.trim().length > 0);
  const distinctSlugs = new Set(selectedSlugs);
  const selectionValid = bucketId.length > 0 && selectedSlugs.length >= 1 && distinctSlugs.size === selectedSlugs.length;
  const currentKey = selectionValid ? `${bucketId}::${[...distinctSlugs].sort().join(",")}` : null;

  useEffect(() => {
    // No setState here for the invalid-selection case: `selectionValid` already gates
    // both the preview UI and canSave below, so a stale preview/previewKey from a prior
    // valid selection is simply never read while the selection is invalid.
    if (!currentKey) return;
    let cancelled = false;
    // Synchronously flipping to a loading state as the selection changes (rather than
    // only after the request resolves) is deliberate here, same precedent as
    // ObfuscatedEmail.tsx's client-only reveal.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewLoading(true);
    setPreviewError(null);
    api("/api/admin/polls/bucket-rules/preview", "POST", {
      bucketId,
      tagSlugs: selectedSlugs,
      ...(excludeRuleId ? { excludeRuleId } : {}),
    })
      .then((result: PreviewResult) => {
        if (cancelled) return;
        setPreview(result);
        setPreviewKey(currentKey);
      })
      .catch((err) => {
        if (cancelled) return;
        setPreviewError(err instanceof Error ? err.message : "Failed to check affected programs");
        setPreview(null);
        setPreviewKey(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // currentKey already encodes bucketId + the distinct selected slugs -- re-running on
    // it alone (not bucketId/selectedSlugs separately) avoids a redundant re-fetch when
    // an edit re-adds the same tag to a different picker slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  const canSave = selectionValid && preview !== null && previewKey === currentKey && !previewLoading;

  function updateSlug(index: number, slug: string) {
    setTagSlugs((prev) => prev.map((s, i) => (i === index ? slug : s)));
  }

  function addCondition() {
    setTagSlugs((prev) => [...prev, ""]);
  }

  function removeCondition(index: number) {
    setTagSlugs((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Bucket
        <Select value={bucketId} onChange={(e) => setBucketId(e.target.value)} className="max-w-sm">
          <option value="">Choose a bucket...</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Attach when the program has ALL of these tags</span>
        {tagSlugs.map((slug, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select value={slug} onChange={(e) => updateSlug(i, e.target.value)} className="max-w-xs">
              <option value="">Choose a tag...</option>
              {tags.map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </Select>
            {tagSlugs.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeCondition(i)}>
                Remove
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" className="self-start" onClick={addCondition}>
          + Add condition
        </Button>
      </div>

      {selectionValid && (
        <Card className="p-3 text-xs">
          {previewLoading && <p className="text-muted">Checking how many programs this affects...</p>}
          {previewError && <p className="text-danger">{previewError}</p>}
          {preview && previewKey === currentKey && !previewLoading && (
            <div className="flex flex-col gap-1">
              <p className="font-medium text-foreground">
                Will newly affect {preview.newlyAffected} program{preview.newlyAffected === 1 ? "" : "s"} (of{" "}
                {preview.matched} matching all tags).
              </p>
              {preview.sampleNames.length > 0 && (
                <p className="text-muted">
                  {preview.sampleNames.join(", ")}
                  {preview.newlyAffected > preview.sampleNames.length ? ", …" : ""}
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!canSave || busy}
          onClick={() => onSubmit({ bucketId, tagSlugs: selectedSlugs })}
        >
          {busy ? "Saving..." : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export default function BucketRuleManager({
  rules,
  buckets,
  tags,
}: {
  rules: BucketRuleRow[];
  buckets: BucketRow[];
  tags: TagOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const bucketsById = new Map(buckets.map((b) => [b.id, b]));
  const pickableBuckets = buckets.filter((b) => !b.isCore && b.status === "ACTIVE");

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  function handleRetireToggle(rule: BucketRuleRow) {
    const nextStatus = rule.status === "ACTIVE" ? "RETIRED" : "ACTIVE";
    withBusy(rule.id, () => api(`/api/admin/polls/bucket-rules/${rule.id}`, "PATCH", { status: nextStatus }));
  }

  function handleSaveEdit(rule: BucketRuleRow, input: { bucketId: string; tagSlugs: string[] }) {
    withBusy(rule.id, async () => {
      await api(`/api/admin/polls/bucket-rules/${rule.id}`, "PATCH", input);
      setEditingId(null);
    });
  }

  async function handleCreate(input: { bucketId: string; tagSlugs: string[] }) {
    setCreating(true);
    setError(null);
    try {
      await api("/api/admin/polls/bucket-rules", "POST", input);
      setShowCreate(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Conditional bucket attachment</h2>
        {!showCreate && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowCreate(true)}>
            + Add a rule
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">
        A rule additionally attaches a bucket to every program carrying ALL of its tags -- on top of Core and any
        buckets attached manually below. A per-program question removal still wins over a rule-attached bucket.
      </p>
      {error && <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      {showCreate && (
        <Card className="p-4">
          <RuleForm
            buckets={pickableBuckets}
            tags={tags}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            submitLabel="Add rule"
            busy={creating}
          />
        </Card>
      )}

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {rules.map((rule) => {
          const bucket = bucketsById.get(rule.bucketId);
          const editBuckets =
            bucket && !pickableBuckets.some((b) => b.id === bucket.id) ? [...pickableBuckets, bucket] : pickableBuckets;
          return (
            <div key={rule.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {bucket ? bucket.name : `(missing bucket: ${rule.bucketId})`}
                </span>
                <span className="text-xs text-muted">→ when</span>
                {rule.tagSlugs.map((slug, i) => (
                  <span key={slug} className="flex items-center gap-1">
                    <Badge tone="tag">#{slug}</Badge>
                    {i < rule.tagSlugs.length - 1 && (
                      <span className="text-[10px] font-semibold text-muted">AND</span>
                    )}
                  </span>
                ))}
                {rule.status === "RETIRED" && <Badge tone="warning">Retired</Badge>}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setEditingId((cur) => (cur === rule.id ? null : rule.id))}
                >
                  {editingId === rule.id ? "Close" : "Edit"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyId === rule.id}
                  onClick={() => handleRetireToggle(rule)}
                >
                  {rule.status === "ACTIVE" ? "Retire" : "Reactivate"}
                </Button>
              </div>

              {editingId === rule.id && (
                <Card className="p-3">
                  <RuleForm
                    initial={rule}
                    buckets={editBuckets}
                    tags={tags}
                    excludeRuleId={rule.id}
                    onSubmit={(input) => handleSaveEdit(rule, input)}
                    submitLabel="Save changes"
                    busy={busyId === rule.id}
                  />
                </Card>
              )}
            </div>
          );
        })}
        {rules.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No rules yet.</p>}
      </div>
    </div>
  );
}
