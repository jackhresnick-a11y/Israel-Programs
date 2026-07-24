"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { computeBestForPhrases, type BestForQuestionInput } from "@/lib/pollBestFor";
import { resolveEffectiveTier } from "@/lib/adminFilters";

export type QuestionTier = "DEFINING" | "SIGNIFICANT" | "CONTEXTUAL" | "EXCLUDED";

export type QuestionForCategory = {
  id: string;
  key: string;
  text: string;
  scaleType: "EVALUATIVE" | "DESCRIPTIVE";
  tier: QuestionTier;
  lowPhrase: string | null;
  highPhrase: string | null;
  countedN: number;
};

export type CategoryGroup = { id: string; name: string; questions: QuestionForCategory[] };

type ProgramOption = { id: string; slug: string; name: string };

const TIER_LABELS: Record<QuestionTier, string> = {
  DEFINING: "Defining",
  SIGNIFICANT: "Significant",
  CONTEXTUAL: "Contextual",
  EXCLUDED: "Excluded",
};

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
 * Live preview panel -- a program picker plus the strip `computeBestForPhrases` would
 * produce for it *right now*, using the caller's in-progress (possibly unsaved) tier
 * edits. This is the point of the whole screen: an admin trying DEFINING on a question
 * sees the consequence immediately, before committing anything.
 */
function LivePreview({
  programs,
  allQuestions,
  effectiveTier,
}: {
  programs: ProgramOption[];
  allQuestions: QuestionForCategory[];
  effectiveTier: (questionId: string) => QuestionTier;
}) {
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [stats, setStats] = useState<Record<string, { mean: number | null; count: number }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview(id: string) {
    setProgramId(id);
    if (!id) {
      setStats(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api(`/api/admin/poll-questions/preview?programId=${id}`, "GET");
      const byKey: Record<string, { mean: number | null; count: number }> = {};
      for (const s of res.stats as { key: string; mean: number | null; count: number }[]) {
        byKey[s.key] = { mean: s.mean, count: s.count };
      }
      setStats(byKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setLoading(false);
    }
  }

  const phrases = useMemo(() => {
    if (!stats) return null;
    const candidates: BestForQuestionInput[] = allQuestions.map((q) => {
      const stat = stats[q.key];
      return {
        key: q.key,
        mean: stat?.mean ?? null,
        count: stat?.count ?? 0,
        lowPhrase: q.lowPhrase,
        highPhrase: q.highPhrase,
        tier: effectiveTier(q.id),
      };
    });
    return computeBestForPhrases(candidates);
    // effectiveTier reads from the live pendingTiers state in the parent -- recomputes
    // whenever that changes because the parent re-renders this component with a new
    // function identity on every state update.
  }, [stats, allQuestions, effectiveTier]);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-foreground">Live preview</h2>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Program
        <Select value={programId} onChange={(e) => loadPreview(e.target.value)} className="max-w-sm">
          <option value="">Select a program...</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </label>
      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}
      {loading && <p className="text-xs text-muted">Loading...</p>}
      {!loading && stats && (
        <p className="text-sm text-foreground">
          {phrases && phrases.length >= 2
            ? `Best for someone who wants ${phrases.join(" · ")}`
            : "(no strip -- fewer than 2 eligible questions with current tiers)"}
        </p>
      )}
    </Card>
  );
}

function QuestionRow({
  question,
  pendingTier,
  onTierChange,
}: {
  question: QuestionForCategory;
  pendingTier: QuestionTier;
  onTierChange: (tier: QuestionTier) => void;
}) {
  const dirty = pendingTier !== question.tier;
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="tag">{question.key}</Badge>
        <span className="text-sm text-foreground">{question.text}</span>
        {question.scaleType === "DESCRIPTIVE" && <Badge tone="neutral">Descriptive</Badge>}
        <span className="ml-auto text-xs text-muted">n={question.countedN}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <label className="flex items-center gap-1.5">
          Tier
          <Select
            value={pendingTier}
            onChange={(e) => onTierChange(e.target.value as QuestionTier)}
            className={dirty ? "w-40 border-accent" : "w-40"}
          >
            {(Object.keys(TIER_LABELS) as QuestionTier[]).map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </Select>
        </label>
        {dirty && <Badge tone="info">Unsaved</Badge>}
        <span>low: {question.lowPhrase ?? "—"}</span>
        <span>high: {question.highPhrase ?? "—"}</span>
      </div>
    </div>
  );
}

function CategorySection({
  group,
  pendingTiers,
  setPendingTier,
  onSaved,
}: {
  group: CategoryGroup;
  pendingTiers: Map<string, QuestionTier>;
  setPendingTier: (questionId: string, tier: QuestionTier) => void;
  onSaved: (savedQuestionIds: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveTierFor = (q: QuestionForCategory) => resolveEffectiveTier(pendingTiers, q.id, q.tier);
  const dirtyQuestions = group.questions.filter((q) => effectiveTierFor(q) !== q.tier);
  const definingCount = group.questions.filter((q) => effectiveTierFor(q) === "DEFINING").length;

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        dirtyQuestions.map((q) =>
          api(`/api/admin/polls/questions/${q.id}`, "PATCH", { tier: effectiveTierFor(q) })
        )
      );
      // Only this category's just-saved questions -- a sibling category (which may
      // share a question, since one question can belong to multiple buckets) can still
      // have its own unrelated pending edits sitting unsaved, and this must not clear
      // them.
      onSaved(dirtyQuestions.map((q) => q.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tier changes");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-2 p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{group.name}</h3>
        <span className="text-xs text-muted">({group.questions.length})</span>
        {definingCount === 0 && (
          <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[10px] text-warning">
            No Defining questions in this category
          </span>
        )}
        {dirtyQuestions.length > 0 && (
          <Button type="button" size="sm" className="ml-auto" disabled={busy} onClick={handleSave}>
            {busy ? "Saving..." : `Save ${dirtyQuestions.length} change${dirtyQuestions.length === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>
      {error && <p className="mx-4 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="flex flex-col divide-y divide-border">
        {group.questions.map((q) => (
          <QuestionRow
            key={q.id}
            question={q}
            pendingTier={effectiveTierFor(q)}
            onTierChange={(tier) => setPendingTier(q.id, tier)}
          />
        ))}
      </div>
    </Card>
  );
}

export default function PollQuestionsAdminManager({
  groups,
  programs,
}: {
  groups: CategoryGroup[];
  programs: ProgramOption[];
}) {
  const router = useRouter();
  // Local, unsaved tier overrides keyed by question id -- shared across every category
  // section AND the live-preview panel below, so a change made in one place is visible
  // in the other without a round trip. A question that appears in more than one
  // category (a real case here) shares one entry, so editing it in either section keeps
  // both in sync automatically.
  const [pendingTiers, setPendingTiers] = useState<Map<string, QuestionTier>>(new Map());

  const allQuestions = useMemo(() => {
    const seen = new Set<string>();
    const flat: QuestionForCategory[] = [];
    for (const group of groups) {
      for (const q of group.questions) {
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        flat.push(q);
      }
    }
    return flat;
  }, [groups]);

  function setPendingTier(questionId: string, tier: QuestionTier) {
    setPendingTiers((prev) => {
      const next = new Map(prev);
      next.set(questionId, tier);
      return next;
    });
  }

  function effectiveTier(questionId: string): QuestionTier {
    const question = allQuestions.find((q) => q.id === questionId);
    return resolveEffectiveTier(pendingTiers, questionId, question?.tier ?? "CONTEXTUAL");
  }

  function handleSaved(savedQuestionIds: string[]) {
    setPendingTiers((prev) => {
      const next = new Map(prev);
      for (const id of savedQuestionIds) next.delete(id);
      return next;
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <LivePreview programs={programs} allQuestions={allQuestions} effectiveTier={effectiveTier} />
      {groups.map((group) => (
        <CategorySection
          key={group.id}
          group={group}
          pendingTiers={pendingTiers}
          setPendingTier={setPendingTier}
          onSaved={handleSaved}
        />
      ))}
      {groups.length === 0 && <p className="text-sm text-muted">No active questions.</p>}
    </div>
  );
}
