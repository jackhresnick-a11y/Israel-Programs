"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import RuleEditor from "@/components/admin/flow/RuleEditor";
import OptionSetRulesEditor from "@/components/admin/flow/OptionSetRulesEditor";
import FacetCheckboxGroups from "@/components/admin/flow/FacetCheckboxGroups";
import type { BuilderQuestionRef } from "@/lib/flowRuleBuilder";
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

/** Carries the response status alongside the message so a caller can tell "the server
 * rejected this input" (400, actionable) apart from "the session is no longer valid"
 * (401/403, not about the input at all -- see errorMessage below). */
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function api(url: string, method: string, body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(errBody.error ?? "Request failed", res.status);
  }
  return res.json().catch(() => ({}));
}

/** Every admin route in this app answers a 401/403 with the same generic
 * `{ error: "Unauthorized" }` body (lib/roles.ts's requireRole can't say more --
 * it has no way to know whether the caller's session merely expired or their
 * role changed). Echoing that string next to a form field reads as if the
 * field's *value* was rejected, when the real cause is the admin session going
 * stale mid-edit -- so rephrase 401/403 here, and only here, into something
 * actionable. Any other status (400 from a zod/business-rule rejection, 500)
 * keeps the server's own message, which is the useful one. */
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return "Your admin session expired -- reload the page and sign in again.";
  }
  return err instanceof Error ? err.message : fallback;
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
 * all. Deliberately kept OUT of QuestionCard's card-wide Save (see that component's doc
 * comment) -- folding it in would either drop this preview-gate or block the whole
 * card's Save on a preview fetch, so it keeps its own independent save affordance.
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

  // Written to textually match the preview-text visibility condition below rather than
  // relying on the (currently true, but easy to accidentally break in a future edit)
  // invariant that previewError is only ever set alongside preview=null -- explicit
  // here so the two conditions can't silently drift apart.
  const canSave = dirty && preview !== null && previewKey === currentKey && !previewLoading && !previewError;

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await api(`/api/admin/flow/options/${option.id}`, "PATCH", { matchMode: pending });
      onSaved();
    } catch (err) {
      setSaveError(errorMessage(err, "Failed to save"));
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

// ---------------------------------------------------------------------------
// QuestionCard's staged-draft model -- every field EXCEPT status/order (moved by
// explicit actions, always immediate, never staged) and showWhen/optionSetRules/
// matchMode (each has its own independent save UI -- RuleEditor/
// OptionSetRulesEditor/MatchModeControl). "" stands in for a null string field so a
// controlled <input> always has a defined value.
// ---------------------------------------------------------------------------

type QuestionFieldDraft = {
  prompt: string;
  helpText: string;
  type: FlowQuestionRow["type"];
  skippable: boolean;
  defaultOptionSetKey: string;
};

type OptionFieldDraft = {
  label: string;
  rationale: string;
  weight: string;
  requireIncludesUntagged: boolean;
  optionSetKeysText: string;
  tagSlugs: string[];
  durationValues: string[];
};

function questionDraftFromRow(q: FlowQuestionRow): QuestionFieldDraft {
  return {
    prompt: q.prompt,
    helpText: q.helpText ?? "",
    type: q.type,
    skippable: q.skippable,
    defaultOptionSetKey: q.defaultOptionSetKey ?? "",
  };
}

function optionDraftFromRow(o: FlowOptionRow): OptionFieldDraft {
  return {
    label: o.label,
    rationale: o.rationale ?? "",
    weight: String(o.weight),
    requireIncludesUntagged: o.requireIncludesUntagged,
    optionSetKeysText: o.optionSetKeys.join(", "),
    tagSlugs: o.tagSlugs,
    durationValues: o.durationValues,
  };
}

function sameStringSet(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function isQuestionDirty(draft: QuestionFieldDraft, q: FlowQuestionRow): boolean {
  return (
    draft.prompt !== q.prompt ||
    draft.helpText !== (q.helpText ?? "") ||
    draft.type !== q.type ||
    draft.skippable !== q.skippable ||
    draft.defaultOptionSetKey !== (q.defaultOptionSetKey ?? "")
  );
}

function isOptionDirty(draft: OptionFieldDraft, o: FlowOptionRow): boolean {
  return (
    draft.label !== o.label ||
    draft.rationale !== (o.rationale ?? "") ||
    draft.weight !== String(o.weight) ||
    draft.requireIncludesUntagged !== o.requireIncludesUntagged ||
    draft.optionSetKeysText !== o.optionSetKeys.join(", ") ||
    !sameStringSet(draft.tagSlugs, o.tagSlugs) ||
    !sameStringSet(draft.durationValues, o.durationValues)
  );
}

/** Only the fields that actually changed, in the shape each PATCH route expects --
 * `null` when nothing changed (nothing to send). A blank prompt/label is never sent
 * (mirrors the pre-staging behavior of silently no-op'ing on blank), which is why
 * QuestionCard additionally disables Save outright while any touched prompt/label is
 * blank -- see canSaveCard -- rather than letting Save silently skip just that field. */
function questionPatchBody(draft: QuestionFieldDraft, q: FlowQuestionRow): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};
  if (draft.prompt.trim() && draft.prompt !== q.prompt) body.prompt = draft.prompt.trim();
  if (draft.helpText !== (q.helpText ?? "")) body.helpText = draft.helpText.trim() || null;
  if (draft.type !== q.type) body.type = draft.type;
  if (draft.skippable !== q.skippable) body.skippable = draft.skippable;
  if (draft.defaultOptionSetKey !== (q.defaultOptionSetKey ?? "")) {
    body.defaultOptionSetKey = draft.defaultOptionSetKey.trim() || null;
  }
  return Object.keys(body).length > 0 ? body : null;
}

function optionPatchBody(draft: OptionFieldDraft, o: FlowOptionRow): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};
  if (draft.label.trim() && draft.label !== o.label) body.label = draft.label.trim();
  if (draft.rationale !== (o.rationale ?? "")) body.rationale = draft.rationale.trim() || null;
  const weightNum = Number.parseInt(draft.weight, 10);
  if (!Number.isNaN(weightNum) && weightNum !== o.weight) body.weight = weightNum;
  if (draft.requireIncludesUntagged !== o.requireIncludesUntagged) {
    body.requireIncludesUntagged = draft.requireIncludesUntagged;
  }
  const optionSetKeys = draft.optionSetKeysText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (JSON.stringify(optionSetKeys) !== JSON.stringify(o.optionSetKeys)) body.optionSetKeys = optionSetKeys;
  if (!sameStringSet(draft.tagSlugs, o.tagSlugs)) body.tagSlugs = draft.tagSlugs;
  if (!sameStringSet(draft.durationValues, o.durationValues)) body.durationValues = draft.durationValues;
  return Object.keys(body).length > 0 ? body : null;
}

/**
 * One question's editable fields, staged behind a single explicit Save/Cancel --
 * nothing here (prompt, help text, type, skippable, default option-set fallback, and
 * every option's label/rationale/weight/require-includes-untagged/option-set-keys/
 * tag & duration facets) saves silently on blur/change anymore. State is plain
 * useState seeded once from props (same "compare state to the live prop, never a
 * stashed baseline" trick RuleEditor/MatchModeControl already use) -- a successful
 * save's router.refresh() delivers new props matching what was just saved, so the
 * dirty flag and "Unsaved" badge self-dismiss with no extra resync effect; an
 * UNRELATED refresh (another card's edit, a Retire elsewhere) simply leaves an
 * in-progress draft here untouched, since this component never remounts for its own
 * question id. Option drafts are a lazy id-keyed map (component: `optionDrafts[id]
 * ?? optionDraftFromRow(option)`) rather than eagerly mirroring the whole options
 * array, so a same-card option add/remove (Add option, Delete) -- both still
 * immediate actions, not staged -- can never desync this map from the live options.
 *
 * Explicit actions (move up/down, Retire/Reactivate, Delete, Add option) stay
 * immediate, unstaged -- a click IS the confirmation for those; staging them would
 * be surprising. showWhen/optionSetRules (RuleEditor/OptionSetRulesEditor) and
 * matchMode (MatchModeControl) keep their own independent save UIs (see design
 * decisions in the plan this shipped from) -- only the fields above are gathered
 * into this card-wide Save.
 */
function QuestionCard({
  question,
  index,
  totalQuestions,
  bank,
  tagsByCategory,
  durationOptions,
  busyId,
  onMoveQuestion,
  onToggleQuestionStatus,
  onDeleteQuestion,
  onMoveOption,
  onToggleOptionStatus,
  onDeleteOption,
  newOptionLabel,
  onNewOptionLabelChange,
  creatingOptionFor,
  onCreateOption,
}: {
  question: FlowQuestionRow;
  index: number;
  totalQuestions: number;
  bank: BuilderQuestionRef[];
  tagsByCategory: Map<string, TagOption[]>;
  durationOptions: DurationOptionRow[];
  busyId: string | null;
  onMoveQuestion: (index: number, direction: -1 | 1) => void;
  onToggleQuestionStatus: (question: FlowQuestionRow) => void;
  onDeleteQuestion: (question: FlowQuestionRow) => void;
  onMoveOption: (question: FlowQuestionRow, index: number, direction: -1 | 1) => void;
  onToggleOptionStatus: (option: FlowOptionRow) => void;
  onDeleteOption: (option: FlowOptionRow) => void;
  newOptionLabel: string;
  onNewOptionLabelChange: (value: string) => void;
  creatingOptionFor: boolean;
  onCreateOption: (question: FlowQuestionRow) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [questionDraft, setQuestionDraft] = useState<QuestionFieldDraft>(() => questionDraftFromRow(question));
  const [optionDrafts, setOptionDrafts] = useState<Record<string, OptionFieldDraft>>({});
  const [saving, setSaving] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [manuallyExpanded, setManuallyExpanded] = useState(false);

  const sortedOptions = [...question.options].sort((a, b) => a.order - b.order);
  const effectiveOptionDraft = (option: FlowOptionRow) => optionDrafts[option.id] ?? optionDraftFromRow(option);

  const questionDirty = isQuestionDirty(questionDraft, question);
  const optionsDirty = question.options.some((o) => isOptionDirty(effectiveOptionDraft(o), o));
  const cardDirty = questionDirty || optionsDirty;
  // A dirty card always shows its body -- collapsing mid-edit would hide the very
  // Save/Cancel bar (and any inline error) the user needs to resolve it.
  const expanded = manuallyExpanded || cardDirty;
  const hasConditions = question.showWhen != null || question.optionSetRules != null;

  const blankTouchedField =
    (questionDirty && !questionDraft.prompt.trim()) ||
    question.options.some((o) => {
      const draft = effectiveOptionDraft(o);
      return isOptionDirty(draft, o) && !draft.label.trim();
    });

  const canSaveCard = cardDirty && !saving && !blankTouchedField;

  function updateQuestionField<K extends keyof QuestionFieldDraft>(field: K, value: QuestionFieldDraft[K]) {
    setQuestionDraft((prev) => ({ ...prev, [field]: value }));
  }

  function updateOptionField<K extends keyof OptionFieldDraft>(option: FlowOptionRow, field: K, value: OptionFieldDraft[K]) {
    setOptionDrafts((prev) => ({
      ...prev,
      [option.id]: { ...(prev[option.id] ?? optionDraftFromRow(option)), [field]: value },
    }));
  }

  function toggleOptionTag(option: FlowOptionRow, slug: string) {
    const draft = effectiveOptionDraft(option);
    const next = draft.tagSlugs.includes(slug)
      ? draft.tagSlugs.filter((s) => s !== slug)
      : [...draft.tagSlugs, slug];
    updateOptionField(option, "tagSlugs", next);
  }

  function toggleOptionDuration(option: FlowOptionRow, value: string) {
    const draft = effectiveOptionDraft(option);
    const next = draft.durationValues.includes(value)
      ? draft.durationValues.filter((v) => v !== value)
      : [...draft.durationValues, value];
    updateOptionField(option, "durationValues", next);
  }

  async function handleSaveCard() {
    setSaving(true);
    setCardError(null);
    const requests: Promise<unknown>[] = [];
    const qBody = questionPatchBody(questionDraft, question);
    if (qBody) requests.push(api(`/api/admin/flow/questions/${question.id}`, "PATCH", qBody));
    for (const option of question.options) {
      const oBody = optionPatchBody(effectiveOptionDraft(option), option);
      if (oBody) requests.push(api(`/api/admin/flow/options/${option.id}`, "PATCH", oBody));
    }
    const results = await Promise.allSettled(requests);
    router.refresh();
    const firstFailure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (firstFailure) {
      setCardError(errorMessage(firstFailure.reason, "Failed to save"));
    } else {
      toast("Question saved");
    }
    setSaving(false);
  }

  function handleCancelCard() {
    setQuestionDraft(questionDraftFromRow(question));
    setOptionDrafts({});
    setCardError(null);
  }

  return (
    <div className="flex flex-col rounded border border-border" data-testid={`question-card-${question.id}`}>
      <button
        type="button"
        data-testid={`question-card-toggle-${question.id}`}
        className="flex w-full flex-wrap items-center gap-2 p-4 text-left"
        aria-expanded={expanded}
        onClick={() => setManuallyExpanded((v) => !v)}
      >
        <span aria-hidden className="w-3 text-muted">
          {expanded ? "−" : "+"}
        </span>
        <span className="font-medium text-foreground">{questionDraft.prompt || question.prompt}</span>
        <Badge tone="neutral">{questionDraft.type}</Badge>
        <Badge tone="neutral">v{question.version}</Badge>
        <span className="text-xs text-muted">{question.status === "ACTIVE" ? "Active" : "Retired"}</span>
        <span className="text-xs text-muted">
          {question.options.length} option{question.options.length === 1 ? "" : "s"}
        </span>
        {hasConditions && <Badge tone="info">has conditions</Badge>}
        {cardDirty && <Badge tone="info">Unsaved</Badge>}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1 py-0"
                disabled={index === 0 || busyId === question.id}
                onClick={() => onMoveQuestion(index, -1)}
                aria-label="Move question up"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1 py-0"
                disabled={index === totalQuestions - 1 || busyId === question.id}
                onClick={() => onMoveQuestion(index, 1)}
                aria-label="Move question down"
              >
                <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
            <Input
              value={questionDraft.prompt}
              className="max-w-md flex-1"
              disabled={busyId === question.id || saving}
              onChange={(e) => updateQuestionField("prompt", e.target.value)}
            />
            <Select
              value={questionDraft.type}
              disabled={busyId === question.id || saving}
              onChange={(e) => updateQuestionField("type", e.target.value as FlowQuestionRow["type"])}
              className="w-auto"
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <span className="text-xs text-muted">{question.status === "ACTIVE" ? "Active" : "Retired"}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busyId === question.id}
              onClick={() => onToggleQuestionStatus(question)}
            >
              {question.status === "ACTIVE" ? "Retire" : "Reactivate"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busyId === question.id}
              onClick={() => onDeleteQuestion(question)}
            >
              Delete
            </Button>
          </div>

          <p className="font-mono text-xs text-muted">key: {question.key}</p>

          <Input
            value={questionDraft.helpText}
            placeholder="Help text shown under the prompt (optional)"
            disabled={busyId === question.id || saving}
            onChange={(e) => updateQuestionField("helpText", e.target.value)}
          />

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={questionDraft.skippable}
              disabled={busyId === question.id || saving}
              onChange={(e) => updateQuestionField("skippable", e.target.checked)}
            />
            Skippable
          </label>

          <RuleEditor
            question={question}
            bank={bank}
            onSaved={() => router.refresh()}
            api={api}
            errorMessage={errorMessage}
          />

          <OptionSetRulesEditor
            question={question}
            bank={bank}
            onSaved={() => router.refresh()}
            api={api}
            errorMessage={errorMessage}
          />

          <Input
            value={questionDraft.defaultOptionSetKey}
            placeholder="Fallback option-set key (used only if option-set rules above are empty or fail to parse)"
            className="max-w-md"
            disabled={busyId === question.id || saving}
            onChange={(e) => updateQuestionField("defaultOptionSetKey", e.target.value)}
          />

          <div className="flex flex-col divide-y divide-border rounded border border-border pl-2">
            {sortedOptions.map((option, optIndex) => {
              const draft = effectiveOptionDraft(option);
              return (
                <div key={option.id} className="flex flex-col gap-2 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-4 px-1 py-0"
                        disabled={optIndex === 0 || busyId === option.id}
                        onClick={() => onMoveOption(question, optIndex, -1)}
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
                        onClick={() => onMoveOption(question, optIndex, 1)}
                        aria-label="Move option down"
                      >
                        <ArrowDown className="h-3 w-3" strokeWidth={1.5} />
                      </Button>
                    </div>
                    <Input
                      value={draft.label}
                      className="max-w-xs"
                      disabled={busyId === option.id || saving}
                      onChange={(e) => updateOptionField(option, "label", e.target.value)}
                    />
                    <span className="text-xs text-muted">{option.status === "ACTIVE" ? "Active" : "Retired"}</span>
                    {isOptionDirty(draft, option) && <Badge tone="info">Unsaved</Badge>}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busyId === option.id}
                      onClick={() => onToggleOptionStatus(option)}
                    >
                      {option.status === "ACTIVE" ? "Retire" : "Reactivate"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="ml-auto"
                      disabled={busyId === option.id}
                      onClick={() => onDeleteOption(option)}
                    >
                      Delete
                    </Button>
                  </div>

                  <p className="font-mono text-xs text-muted">key: {option.key}</p>

                  <MatchModeControl option={option} question={question} onSaved={() => router.refresh()} />

                  <Input
                    value={draft.rationale}
                    placeholder="One-line reason this option exists (shown under it)"
                    className="max-w-md"
                    disabled={busyId === option.id || saving}
                    onChange={(e) => updateOptionField(option, "rationale", e.target.value)}
                  />

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-foreground">
                      Weight
                      <Input
                        type="number"
                        value={draft.weight}
                        className="w-20"
                        disabled={busyId === option.id || saving}
                        onChange={(e) => updateOptionField(option, "weight", e.target.value)}
                      />
                    </label>
                    {option.matchMode === "REQUIRE" && (
                      <label className="flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          checked={draft.requireIncludesUntagged}
                          disabled={busyId === option.id || saving}
                          onChange={(e) => updateOptionField(option, "requireIncludesUntagged", e.target.checked)}
                        />
                        A program with no tag in this category still passes
                      </label>
                    )}
                  </div>

                  <Input
                    value={draft.optionSetKeysText}
                    placeholder="Option-set keys this belongs to, comma-separated (empty = every set)"
                    className="max-w-md"
                    disabled={busyId === option.id || saving}
                    onChange={(e) => updateOptionField(option, "optionSetKeysText", e.target.value)}
                  />

                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">Tags &amp; duration this option contributes:</span>
                    <FacetCheckboxGroups
                      tagsByCategory={tagsByCategory}
                      durationOptions={durationOptions}
                      selectedTagSlugs={draft.tagSlugs}
                      selectedDurationValues={draft.durationValues}
                      onToggleTag={(slug) => toggleOptionTag(option, slug)}
                      onToggleDuration={(value) => toggleOptionDuration(option, value)}
                      disabled={busyId === option.id || saving}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border p-2 pl-4">
            <Input
              placeholder="New option label"
              value={newOptionLabel}
              onChange={(e) => onNewOptionLabelChange(e.target.value)}
              className="max-w-56"
            />
            <Button
              type="button"
              size="sm"
              disabled={!newOptionLabel.trim() || creatingOptionFor}
              onClick={() => onCreateOption(question)}
            >
              {creatingOptionFor ? "Adding..." : "Add option"}
            </Button>
          </div>

          {cardDirty && (
            <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border px-2 py-1">
              {blankTouchedField && (
                <span className="text-xs text-danger">Prompt and every option label must be non-empty.</span>
              )}
              <Button type="button" size="sm" disabled={!canSaveCard} className="ml-auto" onClick={handleSaveCard}>
                {saving ? "Saving..." : "Save question"}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={handleCancelCard}>
                Cancel
              </Button>
            </div>
          )}
          {cardError && <p className="text-xs text-danger">{cardError}</p>}
        </div>
      )}
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
 * Field edits are staged behind an explicit Save/Cancel per question card
 * (QuestionCard above) -- nothing here saves silently on blur/change anymore.
 * showWhen/optionSetRules are edited via RuleEditor/OptionSetRulesEditor
 * (components/admin/flow/*) -- a row-based visual builder for the modellable subset
 * of the rule grammar, with a raw-JSON fallback for anything it can't express. The
 * server (lib/flow.ts, via lib/flowShared.ts's flowConditionSchema/
 * flowOptionSetRulesSchema) remains the real validator either way -- the builder's
 * client-side checks (lib/flowRuleBuilder.ts) mirror it, they don't replace it. See
 * find-v2-question-spec.md for the rule shapes each question actually needs.
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

  // The rule builder's question/option reference bank -- derived fresh from the live
  // `questions` prop on every render, so an admin's edit to another question's order
  // or a retired option is reflected the instant router.refresh() delivers new props.
  const bank: BuilderQuestionRef[] = questions.map((q) => ({
    key: q.key,
    order: q.order,
    prompt: q.prompt,
    options: q.options.map((o) => ({ key: o.key, label: o.label, status: o.status })),
  }));

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
      setError(errorMessage(err, "Something went wrong"));
    } finally {
      setBusyId(null);
    }
  }

  // -- explicit, always-immediate question actions --

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
      setError(errorMessage(err, "Failed to create question"));
    } finally {
      setCreatingQuestion(false);
    }
  }

  // -- explicit, always-immediate option actions --

  function handleToggleOptionStatus(option: FlowOptionRow) {
    const next = option.status === "ACTIVE" ? "RETIRED" : "ACTIVE";
    withBusy(option.id, () => api(`/api/admin/flow/options/${option.id}`, "PATCH", { status: next }));
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
      setError(errorMessage(err, "Failed to create option"));
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
        {sortedQuestions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            totalQuestions={sortedQuestions.length}
            bank={bank}
            tagsByCategory={tagsByCategory}
            durationOptions={durationOptions}
            busyId={busyId}
            onMoveQuestion={handleMoveQuestion}
            onToggleQuestionStatus={handleToggleQuestionStatus}
            onDeleteQuestion={handleDeleteQuestion}
            onMoveOption={handleMoveOption}
            onToggleOptionStatus={handleToggleOptionStatus}
            onDeleteOption={handleDeleteOption}
            newOptionLabel={newOptionLabel[question.id] ?? ""}
            onNewOptionLabelChange={(value) => setNewOptionLabel((prev) => ({ ...prev, [question.id]: value }))}
            creatingOptionFor={creatingOptionFor === question.id}
            onCreateOption={handleCreateOption}
          />
        ))}
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
