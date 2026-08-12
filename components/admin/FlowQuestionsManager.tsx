"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { DurationType } from "@/app/generated/prisma/enums";

export type FlowOptionRow = {
  id: string;
  key: string;
  label: string;
  rationale: string | null;
  order: number;
  status: "ACTIVE" | "RETIRED";
  tagSlugs: string[];
  durationValues: string[];
  matchMode: "WEIGHT" | "REQUIRE";
  weight: number;
  requireIncludesUntagged: boolean;
  optionSetKeys: string[];
};

export type FlowQuestionRow = {
  id: string;
  key: string;
  prompt: string;
  helpText: string | null;
  type: "FILTER" | "CHALLENGE" | "TRADEOFF";
  skippable: boolean;
  showWhen: unknown;
  optionSetRules: unknown;
  defaultOptionSetKey: string | null;
  version: number;
  order: number;
  status: "ACTIVE" | "RETIRED";
  options: FlowOptionRow[];
};

export type TagOption = { slug: string; name: string; category: string | null };
export type DurationOptionRow = { value: DurationType; label: string };

const QUESTION_TYPES = ["FILTER", "CHALLENGE", "TRADEOFF"] as const;
const MATCH_MODES = ["WEIGHT", "REQUIRE"] as const;

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

/** Parses a JSON-rule textarea's current text into the value a PATCH body should
 * carry: empty text -> null (clears the rule), valid JSON -> the parsed value,
 * invalid JSON -> a parse error reported to the caller rather than sent to the
 * server (the server's own zod schema is the real validator; this is just a fast
 * "is this even JSON" check so a typo doesn't round-trip for nothing). */
function parseRuleText(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, error: "Not valid JSON" };
  }
}

function jsonText(value: unknown): string {
  return value == null ? "" : JSON.stringify(value, null, 2);
}

/**
 * The hard-eliminator (matchMode) toggle, staged rather than saved on change like every
 * other field in this manager -- find-v2-question-spec.md's build order calls this out
 * specifically: "that's the edit that silently changes every future user's results."
 * Picking a new mode doesn't PATCH anything yet; it fetches POST /api/admin/flow/preview
 * with this ONE option overridden and a synthetic single-answer state (as if a
 * respondent picked exactly this option), and Save stays disabled until a preview
 * matching the CURRENT pending selection has loaded -- same `previewKey` staleness gate
 * as BucketRuleManager's rule preview. Cancel reverts to the live value with no write at
 * all, so nothing here is ever a dead end: every other field keeps its existing
 * immediate-save behavior, and this one stays just as editable, only with a
 * look-before-you-leap step in front of the one edit that's easy to get wrong silently.
 */
function MatchModeControl({
  option,
  question,
  onSaved,
}: {
  option: FlowOptionRow;
  question: FlowQuestionRow;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState<"WEIGHT" | "REQUIRE">(option.matchMode);
  const [preview, setPreview] = useState<{ survivorCount: number; totalCount: number } | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = pending !== option.matchMode;
  const currentKey = `${option.id}:${pending}`;

  useEffect(() => {
    if (!dirty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      setPreviewKey(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    api("/api/admin/flow/preview", "POST", {
      answers: { [question.key]: [option.key] },
      optionOverrides: [{ optionId: option.id, matchMode: pending }],
    })
      .then((result: { survivorCount: number; totalCount: number }) => {
        if (cancelled) return;
        setPreview({ survivorCount: result.survivorCount, totalCount: result.totalCount });
        setPreviewKey(currentKey);
      })
      .catch((err) => {
        if (cancelled) return;
        setPreviewError(err instanceof Error ? err.message : "Failed to preview");
        setPreview(null);
        setPreviewKey(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // currentKey already encodes option.id + the pending mode -- re-running on it (and
    // `dirty`, to skip the fetch entirely once reverted) mirrors RuleForm's own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, dirty]);

  const canSave = dirty && preview !== null && previewKey === currentKey && !previewLoading;

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await api(`/api/admin/flow/options/${option.id}`, "PATCH", { matchMode: pending });
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setPending(option.matchMode);
    setPreview(null);
    setPreviewKey(null);
    setPreviewError(null);
    setSaveError(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Select
          value={pending}
          disabled={saving}
          onChange={(e) => setPending(e.target.value as "WEIGHT" | "REQUIRE")}
          className="w-auto"
        >
          {MATCH_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        {pending === "REQUIRE" && <Badge tone="warning">eliminator</Badge>}
        {dirty && <Badge tone="info">Unsaved</Badge>}
      </div>
      {dirty && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border px-2 py-1">
          {previewLoading && <span className="text-xs text-muted">Checking how many programs would survive...</span>}
          {previewError && <span className="text-xs text-danger">{previewError}</span>}
          {preview && previewKey === currentKey && !previewLoading && !previewError && (
            <span className="text-xs text-foreground">
              If a respondent picks this: {preview.survivorCount} of {preview.totalCount} programs would survive.
            </span>
          )}
          <Button type="button" size="sm" disabled={!canSave || saving} className="ml-auto" onClick={handleSave}>
            {saving ? "Saving..." : "Save eliminator change"}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      )}
      {saveError && <p className="text-xs text-danger">{saveError}</p>}
    </div>
  );
}

/**
 * Admin CRUD for the /match challenge flow: questions (prompt, help text, type,
 * skippable, show-condition, option-set rules, order, active/retired) each own an
 * ordered set of options (label, rationale, weight, match mode, the tag slugs /
 * duration values it contributes, and which option set(s) it belongs to). Same
 * fetch-then-router.refresh() shape as FinderQuestionsManager -- no client-side
 * cache of its own, the server component re-fetches on every mutation.
 *
 * showWhen/optionSetRules are edited as raw JSON in a textarea rather than a visual
 * rule builder -- the server (lib/flow.ts, via lib/flowShared.ts's
 * flowConditionSchema/flowOptionSetRulesSchema) is the real validator either way, and
 * a working textarea beats a half-built visual editor. See find-v2-question-spec.md
 * for the rule shapes each question actually needs.
 */
export default function FlowQuestionsManager({
  questions,
  tags,
  durationOptions,
  programTypeCoverage,
}: {
  questions: FlowQuestionRow[];
  tags: TagOption[];
  durationOptions: DurationOptionRow[];
  /** How many PUBLISHED programs carry none of the "program-type" tags Q6 targets
   * (israeli-yeshiva / american-yeshiva / israeli-midrasha / american-seminary /
   * religious-mechina / regular-mechina / academic-college-credit /
   * experience-travel) -- these tags are seeded but not yet backfilled onto the
   * catalog, so Q6 contributes nothing to /match's ranking until that separate
   * pass runs. Surfaced here rather than hidden, per CLAUDE.md's "/find v2"
   * section. Optional so the prop can be added incrementally without breaking
   * existing callers/tests. */
  programTypeCoverage?: { total: number; missing: number };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ruleErrors, setRuleErrors] = useState<Record<string, string>>({});
  const [newPrompt, setNewPrompt] = useState("");
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [newOptionLabel, setNewOptionLabel] = useState<Record<string, string>>({});
  const [creatingOptionFor, setCreatingOptionFor] = useState<string | null>(null);

  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  const tagsByCategory = new Map<string, TagOption[]>();
  for (const tag of tags) {
    const key = tag.category ?? "uncategorized";
    const bucket = tagsByCategory.get(key);
    if (bucket) bucket.push(tag);
    else tagsByCategory.set(key, [tag]);
  }

  // "Only two things eliminate: program gender, and 'still in high school'" is a
  // property of the data (exactly two ELIMINATING QUESTIONS), never enforced by
  // code -- this is the visible guard against a third one appearing by accident.
  // Counts QUESTIONS, not raw REQUIRE options: a single eliminating dimension
  // (e.g. gender) legitimately carries several mutually-exclusive REQUIRE
  // options (boys-only, girls-only) that a respondent picks only one of --
  // counting options directly would false-positive on exactly that case.
  const requireQuestionCount = questions.filter(
    (q) => q.status === "ACTIVE" && q.options.some((o) => o.status === "ACTIVE" && o.matchMode === "REQUIRE")
  ).length;

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

  function setRuleError(fieldId: string, message: string | null) {
    setRuleErrors((prev) => {
      const next = { ...prev };
      if (message) next[fieldId] = message;
      else delete next[fieldId];
      return next;
    });
  }

  // -- question field handlers --

  function handleRenamePrompt(question: FlowQuestionRow, prompt: string) {
    if (!prompt.trim() || prompt === question.prompt) return;
    withBusy(question.id, () => api(`/api/admin/flow/questions/${question.id}`, "PATCH", { prompt }));
  }

  function handleQuestionHelpTextChange(question: FlowQuestionRow, helpText: string) {
    const next = helpText.trim() || null;
    if (next === question.helpText) return;
    withBusy(question.id, () => api(`/api/admin/flow/questions/${question.id}`, "PATCH", { helpText: next }));
  }

  function handleQuestionTypeChange(question: FlowQuestionRow, type: string) {
    if (type === question.type) return;
    withBusy(question.id, () => api(`/api/admin/flow/questions/${question.id}`, "PATCH", { type }));
  }

  function handleSkippableChange(question: FlowQuestionRow, skippable: boolean) {
    withBusy(question.id, () => api(`/api/admin/flow/questions/${question.id}`, "PATCH", { skippable }));
  }

  function handleDefaultOptionSetKeyChange(question: FlowQuestionRow, value: string) {
    const next = value.trim() || null;
    if (next === question.defaultOptionSetKey) return;
    withBusy(question.id, () =>
      api(`/api/admin/flow/questions/${question.id}`, "PATCH", { defaultOptionSetKey: next })
    );
  }

  function handleShowWhenChange(question: FlowQuestionRow, text: string) {
    const fieldId = `showWhen:${question.id}`;
    const parsed = parseRuleText(text);
    if (!parsed.ok) {
      setRuleError(fieldId, parsed.error);
      return;
    }
    setRuleError(fieldId, null);
    if (JSON.stringify(parsed.value) === JSON.stringify(question.showWhen ?? null)) return;
    withBusy(question.id, () =>
      api(`/api/admin/flow/questions/${question.id}`, "PATCH", { showWhen: parsed.value })
    );
  }

  function handleOptionSetRulesChange(question: FlowQuestionRow, text: string) {
    const fieldId = `optionSetRules:${question.id}`;
    const parsed = parseRuleText(text);
    if (!parsed.ok) {
      setRuleError(fieldId, parsed.error);
      return;
    }
    setRuleError(fieldId, null);
    if (JSON.stringify(parsed.value) === JSON.stringify(question.optionSetRules ?? null)) return;
    withBusy(question.id, () =>
      api(`/api/admin/flow/questions/${question.id}`, "PATCH", { optionSetRules: parsed.value })
    );
  }

  function handleToggleQuestionStatus(question: FlowQuestionRow) {
    const next = question.status === "ACTIVE" ? "RETIRED" : "ACTIVE";
    withBusy(question.id, () => api(`/api/admin/flow/questions/${question.id}`, "PATCH", { status: next }));
  }

  function handleMoveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sortedQuestions.length) return;
    const a = sortedQuestions[index];
    const b = sortedQuestions[target];
    withBusy(a.id, async () => {
      await api(`/api/admin/flow/questions/${a.id}`, "PATCH", { order: b.order });
      await api(`/api/admin/flow/questions/${b.id}`, "PATCH", { order: a.order });
    });
  }

  function handleDeleteQuestion(question: FlowQuestionRow) {
    if (!confirm(`Delete question "${question.prompt}"? Its options are deleted too.`)) return;
    withBusy(question.id, () => api(`/api/admin/flow/questions/${question.id}`, "DELETE"));
  }

  async function handleCreateQuestion() {
    if (!newPrompt.trim()) return;
    setCreatingQuestion(true);
    setError(null);
    try {
      await api("/api/admin/flow/questions", "POST", { prompt: newPrompt });
      setNewPrompt("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create question");
    } finally {
      setCreatingQuestion(false);
    }
  }

  // -- option field handlers --

  function handleRenameOptionLabel(option: FlowOptionRow, label: string) {
    if (!label.trim() || label === option.label) return;
    withBusy(option.id, () => api(`/api/admin/flow/options/${option.id}`, "PATCH", { label }));
  }

  function handleOptionRationaleChange(option: FlowOptionRow, rationale: string) {
    const next = rationale.trim() || null;
    if (next === option.rationale) return;
    withBusy(option.id, () => api(`/api/admin/flow/options/${option.id}`, "PATCH", { rationale: next }));
  }

  function handleWeightChange(option: FlowOptionRow, text: string) {
    const value = Number.parseInt(text, 10);
    if (Number.isNaN(value) || value === option.weight) return;
    withBusy(option.id, () => api(`/api/admin/flow/options/${option.id}`, "PATCH", { weight: value }));
  }

  function handleRequireIncludesUntaggedChange(option: FlowOptionRow, requireIncludesUntagged: boolean) {
    withBusy(option.id, () =>
      api(`/api/admin/flow/options/${option.id}`, "PATCH", { requireIncludesUntagged })
    );
  }

  function handleOptionSetKeysChange(option: FlowOptionRow, text: string) {
    const next = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (JSON.stringify(next) === JSON.stringify(option.optionSetKeys)) return;
    withBusy(option.id, () => api(`/api/admin/flow/options/${option.id}`, "PATCH", { optionSetKeys: next }));
  }

  function handleToggleOptionStatus(option: FlowOptionRow) {
    const next = option.status === "ACTIVE" ? "RETIRED" : "ACTIVE";
    withBusy(option.id, () => api(`/api/admin/flow/options/${option.id}`, "PATCH", { status: next }));
  }

  function handleToggleOptionTag(option: FlowOptionRow, slug: string) {
    const next = option.tagSlugs.includes(slug)
      ? option.tagSlugs.filter((s) => s !== slug)
      : [...option.tagSlugs, slug];
    withBusy(option.id, () => api(`/api/admin/flow/options/${option.id}`, "PATCH", { tagSlugs: next }));
  }

  function handleToggleOptionDuration(option: FlowOptionRow, value: string) {
    const next = option.durationValues.includes(value)
      ? option.durationValues.filter((v) => v !== value)
      : [...option.durationValues, value];
    withBusy(option.id, () => api(`/api/admin/flow/options/${option.id}`, "PATCH", { durationValues: next }));
  }

  function handleMoveOption(question: FlowQuestionRow, index: number, direction: -1 | 1) {
    const opts = [...question.options].sort((a, b) => a.order - b.order);
    const target = index + direction;
    if (target < 0 || target >= opts.length) return;
    const a = opts[index];
    const b = opts[target];
    withBusy(a.id, async () => {
      await api(`/api/admin/flow/options/${a.id}`, "PATCH", { order: b.order });
      await api(`/api/admin/flow/options/${b.id}`, "PATCH", { order: a.order });
    });
  }

  function handleDeleteOption(option: FlowOptionRow) {
    if (!confirm(`Delete option "${option.label}"?`)) return;
    withBusy(option.id, () => api(`/api/admin/flow/options/${option.id}`, "DELETE"));
  }

  async function handleCreateOption(question: FlowQuestionRow) {
    const label = (newOptionLabel[question.id] ?? "").trim();
    if (!label) return;
    setCreatingOptionFor(question.id);
    setError(null);
    try {
      await api("/api/admin/flow/options", "POST", { questionId: question.id, label });
      setNewOptionLabel((prev) => ({ ...prev, [question.id]: "" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create option");
    } finally {
      setCreatingOptionFor(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      {requireQuestionCount > 2 && (
        <p className="rounded bg-warning-bg px-4 py-2 text-sm text-warning">
          {requireQuestionCount} questions currently carry a hard eliminator (REQUIRE) option. The spec calls for
          exactly two -- program gender and &quot;still in high school&quot;. Double-check the extras are
          intentional.
        </p>
      )}

      {programTypeCoverage && programTypeCoverage.missing > 0 && (
        <p className="rounded bg-info-bg px-4 py-2 text-sm text-info">
          {programTypeCoverage.missing} of {programTypeCoverage.total} published programs have no
          &quot;Program type&quot; tag (yeshiva / midrasha / seminary / mechina split). Q6 will contribute
          nothing to /match&apos;s ranking for those programs until they&apos;re tagged from{" "}
          <a href="/admin/programs" className="underline">
            /admin/programs
          </a>
          .
        </p>
      )}

      <div className="flex flex-col gap-4">
        {sortedQuestions.map((question, index) => {
          const sortedOptions = [...question.options].sort((a, b) => a.order - b.order);
          const showWhenError = ruleErrors[`showWhen:${question.id}`];
          const optionSetRulesError = ruleErrors[`optionSetRules:${question.id}`];
          return (
            <div key={question.id} className="flex flex-col gap-3 rounded border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 py-0"
                    disabled={index === 0 || busyId === question.id}
                    onClick={() => handleMoveQuestion(index, -1)}
                    aria-label="Move question up"
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 py-0"
                    disabled={index === sortedQuestions.length - 1 || busyId === question.id}
                    onClick={() => handleMoveQuestion(index, 1)}
                    aria-label="Move question down"
                  >
                    <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                </div>
                <Input
                  defaultValue={question.prompt}
                  className="max-w-md flex-1"
                  disabled={busyId === question.id}
                  onBlur={(e) => handleRenamePrompt(question, e.target.value)}
                />
                <Select
                  defaultValue={question.type}
                  disabled={busyId === question.id}
                  onChange={(e) => handleQuestionTypeChange(question, e.target.value)}
                  className="w-auto"
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
                <Badge tone="neutral">v{question.version}</Badge>
                <span className="text-xs text-muted">{question.status === "ACTIVE" ? "Active" : "Retired"}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyId === question.id}
                  onClick={() => handleToggleQuestionStatus(question)}
                >
                  {question.status === "ACTIVE" ? "Retire" : "Reactivate"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busyId === question.id}
                  onClick={() => handleDeleteQuestion(question)}
                >
                  Delete
                </Button>
              </div>

              <p className="font-mono text-xs text-muted">key: {question.key}</p>

              <Input
                defaultValue={question.helpText ?? ""}
                placeholder="Help text shown under the prompt (optional)"
                disabled={busyId === question.id}
                onBlur={(e) => handleQuestionHelpTextChange(question, e.target.value)}
              />

              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={question.skippable}
                  disabled={busyId === question.id}
                  onChange={(e) => handleSkippableChange(question, e.target.checked)}
                />
                Skippable
              </label>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  Show-condition (JSON, empty = always shown) -- see find-v2-question-spec.md for the rule shape
                </span>
                <Textarea
                  defaultValue={jsonText(question.showWhen)}
                  placeholder='{"v":1,"when":{"type":"answerIn","questionKey":"life-stage","optionKeys":["working"]}}'
                  className="min-h-16 font-mono text-xs"
                  disabled={busyId === question.id}
                  onBlur={(e) => handleShowWhenChange(question, e.target.value)}
                />
                {showWhenError && <p className="text-xs text-danger">{showWhenError}</p>}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  Option-set rules (JSON, empty = one shared option set for every respondent)
                </span>
                <Textarea
                  defaultValue={jsonText(question.optionSetRules)}
                  placeholder='{"v":1,"default":"mixed","rules":[{"optionSetKey":"boys","when":{...}}]}'
                  className="min-h-16 font-mono text-xs"
                  disabled={busyId === question.id}
                  onBlur={(e) => handleOptionSetRulesChange(question, e.target.value)}
                />
                {optionSetRulesError && <p className="text-xs text-danger">{optionSetRulesError}</p>}
              </div>

              <Input
                defaultValue={question.defaultOptionSetKey ?? ""}
                placeholder="Default option-set key (used when no rule above matches)"
                className="max-w-md"
                disabled={busyId === question.id}
                onBlur={(e) => handleDefaultOptionSetKeyChange(question, e.target.value)}
              />

              <div className="flex flex-col divide-y divide-border rounded border border-border pl-2">
                {sortedOptions.map((option, optIndex) => (
                  <div key={option.id} className="flex flex-col gap-2 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-4 px-1 py-0"
                          disabled={optIndex === 0 || busyId === option.id}
                          onClick={() => handleMoveOption(question, optIndex, -1)}
                          aria-label="Move option up"
                        >
                          <ArrowUp className="h-3 w-3" strokeWidth={1.5} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-4 px-1 py-0"
                          disabled={optIndex === sortedOptions.length - 1 || busyId === option.id}
                          onClick={() => handleMoveOption(question, optIndex, 1)}
                          aria-label="Move option down"
                        >
                          <ArrowDown className="h-3 w-3" strokeWidth={1.5} />
                        </Button>
                      </div>
                      <Input
                        defaultValue={option.label}
                        className="max-w-xs"
                        disabled={busyId === option.id}
                        onBlur={(e) => handleRenameOptionLabel(option, e.target.value)}
                      />
                      <span className="text-xs text-muted">{option.status === "ACTIVE" ? "Active" : "Retired"}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busyId === option.id}
                        onClick={() => handleToggleOptionStatus(option)}
                      >
                        {option.status === "ACTIVE" ? "Retire" : "Reactivate"}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="ml-auto"
                        disabled={busyId === option.id}
                        onClick={() => handleDeleteOption(option)}
                      >
                        Delete
                      </Button>
                    </div>

                    <p className="font-mono text-xs text-muted">key: {option.key}</p>

                    <MatchModeControl option={option} question={question} onSaved={() => router.refresh()} />

                    <Input
                      defaultValue={option.rationale ?? ""}
                      placeholder="One-line reason this option exists (shown under it)"
                      className="max-w-md"
                      disabled={busyId === option.id}
                      onBlur={(e) => handleOptionRationaleChange(option, e.target.value)}
                    />

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs text-foreground">
                        Weight
                        <Input
                          type="number"
                          defaultValue={option.weight}
                          className="w-20"
                          disabled={busyId === option.id}
                          onBlur={(e) => handleWeightChange(option, e.target.value)}
                        />
                      </label>
                      {option.matchMode === "REQUIRE" && (
                        <label className="flex items-center gap-2 text-xs text-foreground">
                          <input
                            type="checkbox"
                            checked={option.requireIncludesUntagged}
                            disabled={busyId === option.id}
                            onChange={(e) => handleRequireIncludesUntaggedChange(option, e.target.checked)}
                          />
                          A program with no tag in this category still passes
                        </label>
                      )}
                    </div>

                    <Input
                      defaultValue={option.optionSetKeys.join(", ")}
                      placeholder="Option-set keys this belongs to, comma-separated (empty = every set)"
                      className="max-w-md"
                      disabled={busyId === option.id}
                      onBlur={(e) => handleOptionSetKeysChange(option, e.target.value)}
                    />

                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted">Duration values this option contributes:</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {durationOptions.map((d) => (
                          <label key={d.value} className="flex items-center gap-2 text-xs text-foreground">
                            <input
                              type="checkbox"
                              checked={option.durationValues.includes(d.value)}
                              disabled={busyId === option.id}
                              onChange={() => handleToggleOptionDuration(option, d.value)}
                            />
                            {d.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted">Tags this option contributes:</span>
                      {[...tagsByCategory.entries()].map(([category, categoryTags]) => (
                        <div key={category} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="text-xs text-muted">{category}:</span>
                          {categoryTags.map((tag) => (
                            <label key={tag.slug} className="flex items-center gap-2 text-xs text-foreground">
                              <input
                                type="checkbox"
                                checked={option.tagSlugs.includes(tag.slug)}
                                disabled={busyId === option.id}
                                onChange={() => handleToggleOptionTag(option, tag.slug)}
                              />
                              {tag.name}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border p-2 pl-4">
                <Input
                  placeholder="New option label"
                  value={newOptionLabel[question.id] ?? ""}
                  onChange={(e) => setNewOptionLabel((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  className="max-w-56"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!(newOptionLabel[question.id] ?? "").trim() || creatingOptionFor === question.id}
                  onClick={() => handleCreateOption(question)}
                >
                  {creatingOptionFor === question.id ? "Adding..." : "Add option"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border p-3">
        <Input
          placeholder="New question prompt, e.g. What stage will you be in when you go?"
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
          className="max-w-md"
        />
        <Button type="button" size="sm" disabled={!newPrompt.trim() || creatingQuestion} onClick={handleCreateQuestion}>
          {creatingQuestion ? "Adding..." : "Add question"}
        </Button>
      </div>
    </div>
  );
}
