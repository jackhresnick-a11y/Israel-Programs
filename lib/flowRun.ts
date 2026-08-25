/**
 * Server-side glue for /match: session lifecycle, response recording, and the
 * results-ranking pipeline. Thin on purpose -- every real decision (visibility,
 * eliminators, scoring) lives in the pure lib/flowShared.ts / lib/flowRank.ts
 * modules; this file only does the Prisma I/O around them.
 */
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { listFlowQuestions } from "@/lib/flow";
import { listPrograms, listAllTags } from "@/lib/programs";
import type { ProgramCardProgram } from "@/components/ProgramCard";
import {
  resolveFlow,
  type CoverageContext,
  type FlowAnswers,
  type FlowAnswerState,
  type FlowQuestionDTO,
} from "@/lib/flowShared";
import {
  buildFlowRunInput,
  survivingPrograms,
  rankPrograms,
  hardFilterRelaxations,
  makeOptionCoverageCounter,
  MIN_OPTION_COVERAGE,
  type RankableProgram,
  type ScoredProgram,
} from "@/lib/flowRank";
import { selectClip, type FlowVideoTriggerDTO, type FlowVideoDTO } from "@/lib/flowClips";
import { getPollRankStats } from "@/lib/pollRankData";
import { makePollModifier } from "@/lib/pollRankModifier";

/** `listFlowQuestions()`'s Prisma rows are structurally compatible with
 * FlowQuestionDTO (Json columns type as JsonValue, a superset of `unknown`) --
 * this is a type-only reshaping, no data transform. */
export async function loadActiveFlowQuestions(): Promise<FlowQuestionDTO[]> {
  const rows = await listFlowQuestions();
  return rows as unknown as FlowQuestionDTO[];
}

export type FlowClipData = { triggers: FlowVideoTriggerDTO[]; videosById: Record<string, FlowVideoDTO> };

/** Every ACTIVE trigger + the ACTIVE videos they point at, in the shape
 * lib/flowClips.ts's selectClip (and components/find/FlowStep.tsx, which calls it
 * client-side) expect. Loaded once per /match render and filtered down to the
 * current question's own triggers by the caller -- small enough (a handful of
 * clips) that there's no need for a per-question query. */
export async function loadFlowClipData(): Promise<FlowClipData> {
  const [triggerRows, videoRows] = await Promise.all([
    prisma.flowVideoTrigger.findMany({ where: { status: "ACTIVE" } }),
    prisma.flowVideo.findMany({ where: { status: "ACTIVE" } }),
  ]);
  const triggers = triggerRows as unknown as FlowVideoTriggerDTO[];
  const videosById = Object.fromEntries((videoRows as unknown as FlowVideoDTO[]).map((v) => [v.id, v]));
  return { triggers, videosById };
}

/** A client-supplied `s` is never trusted beyond existence -- same posture as
 * pollShared's resumeId. A missing or unresolvable session mints a fresh one;
 * the caller (app/match/page.tsx) redirects to attach the real id to the URL
 * before rendering anything, so the URL is always the source of truth.
 *
 * Rate-limited on the MINT path only (an existing, resolvable session is a read,
 * not a write) -- same per-IP posture as the poll system's analogous
 * POST /api/polls/responses/open, which this route otherwise mirrors but, unlike
 * a route handler, has no Request to key off; the caller passes the IP resolved
 * from next/headers. Returns null when the caller is over budget; app/match/page.tsx
 * renders a plain retry message rather than minting an unbounded number of rows. */
export async function resolveOrMintFlowSession(requestedId: string | undefined, isTest: boolean, ip: string): Promise<string | null> {
  if (requestedId) {
    const existing = await prisma.flowSession.findUnique({ where: { id: requestedId }, select: { id: true } });
    if (existing) return existing.id;
  }
  if (!checkRateLimit(`match-open-anon:${ip}`, { limit: 20, windowMs: 10 * 60_000 })) return null;
  const session = await prisma.flowSession.create({ data: { isTest } });
  return session.id;
}

/**
 * Fire-and-forget: diffs the resolved (already-pruned) answer state against
 * each question's latest recorded FlowResponse revision and writes a NEW
 * revision only where something actually changed. Never updates a row in
 * place -- see FlowResponse's schema.prisma doc comment for why (this is the
 * entire mechanism behind measuring whether a clip shifts an answer). Runs via
 * after(), same "never block or fail a page render" posture as
 * lib/analytics.ts's record() -- this table is measurement, not something the
 * flow's own navigation logic ever reads back.
 *
 * videoKeysShown is computed with the SAME pure selectClip the client used to
 * decide what to render, given the SAME inputs (that question's triggers, the
 * submitted answer, and conditionAnswers) -- deterministic, so server and
 * client necessarily agree without the client needing to report anything back.
 * `conditionAnswers` is the FULL resolved map (every visible+answered question,
 * including ones after this one): safe to pass as-is for every question, since
 * a trigger can never reference its own or a later question (enforced at
 * write time), so extra keys in the map are simply never consulted.
 *
 * Known gap: this only ever fires for a question that received SOME submission
 * (an answer, skip, or interstitial acknowledgment). A respondent who watches
 * the Q2 opener and abandons the tab without clicking Continue/Skip leaves no
 * FlowResponse row at all, so that impression goes unmeasured -- FlowSession
 * .videoKeysShown exists in the schema for exactly this case but is not yet
 * written anywhere; tracked as a follow-on, not implemented here.
 */
export function recordFlowResponses(
  sessionId: string,
  questions: FlowQuestionDTO[],
  state: FlowAnswerState,
  clipData: FlowClipData,
  conditionAnswers: FlowAnswers
): void {
  const versionByKey = new Map(questions.map((q) => [q.key, q.version]));
  const idByKey = new Map(questions.map((q) => [q.key, q.id]));
  const entries = [...state.entries()].filter(([key]) => versionByKey.has(key));
  if (entries.length === 0) return;

  after(async () => {
    try {
      for (const [questionKey, value] of entries) {
        const optionKeys = value ?? [];
        const skipped = value === null;
        const latest = await prisma.flowResponse.findFirst({
          where: { sessionId, questionKey },
          orderBy: { revision: "desc" },
        });
        const sameOptionKeys =
          latest !== null && JSON.stringify([...latest.optionKeys].sort()) === JSON.stringify([...optionKeys].sort());
        if (latest && latest.skipped === skipped && sameOptionKeys) continue;

        const questionId = idByKey.get(questionKey);
        const questionTriggers = questionId ? clipData.triggers.filter((t) => t.questionId === questionId) : [];
        const shownVideoId = selectClip(questionTriggers, optionKeys.length > 0 ? optionKeys : null, conditionAnswers, sessionId);
        const shownVideoKey = shownVideoId ? clipData.videosById[shownVideoId]?.key : undefined;

        await prisma.flowResponse.create({
          data: {
            sessionId,
            questionKey,
            questionVersion: versionByKey.get(questionKey)!,
            optionKeys,
            skipped,
            revision: latest ? latest.revision + 1 : 0,
            videoKeysShown: shownVideoKey ? [shownVideoKey] : [],
          },
        });
      }
    } catch (err) {
      console.error("[flowRun] failed to record FlowResponse(s)", err);
    }
  });
}

/** The explicit-submit marker (find-v2-question-spec.md: "Submit at the end --
 * explicit, not auto-advance"). Synchronous, unlike recordFlowResponses -- this
 * is the definitive "the session concluded" stamp, not best-effort measurement,
 * same posture as the poll system's submittedAt. Idempotent: a re-submit (e.g.
 * a refreshed results page) just overwrites resultHref with the same value.
 *
 * `updateMany`, not `update` -- unlike resolveOrMintFlowSession, the submit route
 * never confirmed `id` resolves to a real row first (there's no auth concept for an
 * anonymous session id, so a forged or stale one is a normal, non-exceptional input,
 * not a bug). `update` throws P2025 on no match; `updateMany` silently no-ops, so a
 * bad id still gets a clean 303 redirect to the results page instead of a 500. */
export async function markFlowSessionSubmitted(sessionId: string, resultHref: string): Promise<void> {
  await prisma.flowSession.updateMany({
    where: { id: sessionId },
    data: { submittedAt: new Date(), resultHref },
  });
}

export async function buildTagCategoryMap(): Promise<Map<string, string | null>> {
  const tags = await listAllTags();
  return new Map(tags.map((t) => [t.slug, t.category]));
}

/**
 * Live coverage-gating input for /match: every PUBLISHED program's tagSlugs +
 * durationType, read fresh on every request (never cached, never a hardcoded
 * list -- the task this backs is explicit about that), plus the tag-category map
 * the same eliminator math elsewhere in this file already needs. `listPrograms({})`
 * is the same live read runMatchResults uses for the results pipeline, so a
 * program that's live enough to rank is live enough to back an option here --
 * the two can never disagree about what "published" means.
 */
export async function buildFlowCoverageContext(): Promise<CoverageContext> {
  const [programs, tagCategoryBySlug] = await Promise.all([listPrograms({}), buildTagCategoryMap()]);
  const coveragePrograms = programs.map((p) => ({ id: p.id, durationType: p.durationType, tagSlugs: p.tags.map((t) => t.slug) }));
  return { counter: makeOptionCoverageCounter(coveragePrograms, tagCategoryBySlug), floor: MIN_OPTION_COVERAGE };
}

export type MatchProgram = ProgramCardProgram & RankableProgram;

export type MatchResults = {
  survivorCount: number;
  totalCount: number;
  scored: ScoredProgram<MatchProgram>[];
  relaxations: { questionKey: string; label: string; count: number }[];
};

/**
 * The full results pipeline: visible questions -> criteria/require split ->
 * eliminate -> rank. All in memory over the ~460-program catalog, same posture
 * listPrograms already takes for its own free-text relevance pass -- see
 * lib/flowRank.ts's rankPrograms doc comment for why this never truncates.
 *
 * getPollRankStats() joins the same Promise.all as the catalog/tag reads below --
 * it's one query over the ~300 COUNTED recommend answers (see lib/pollRankData.ts),
 * cheaper than the catalog read it runs alongside, so this adds no serial latency.
 * It only ever nudges ranking WITHIN the already-eliminated survivor set -- REQUIRE
 * eliminators (survivingPrograms, just below) still run first and are never
 * consulted by the poll modifier.
 */
export async function runMatchResults(questions: FlowQuestionDTO[], state: FlowAnswerState): Promise<MatchResults> {
  // resolved.state, not the raw `state` param: a stale answer (an earlier answer to
  // an option a show-condition, an option-set switch, or coverage has since hidden)
  // must never score. app/match/results/page.tsx already passes an already-pruned
  // state in, so this was previously a no-op there; POST /api/admin/flow/preview
  // passes raw admin-supplied answers straight through, where it wasn't.
  const resolved = resolveFlow(questions, state, null);
  const { criteria, requireTargets } = buildFlowRunInput(resolved.visible, resolved.state);

  const [programs, tagCategoryBySlug, pollStats] = await Promise.all([
    listPrograms({}),
    buildTagCategoryMap(),
    getPollRankStats(),
  ]);
  const matchPrograms: MatchProgram[] = programs.map((p) => ({
    ...p,
    tagSlugs: p.tags.map((t) => t.slug),
  }));

  const survivors = survivingPrograms(matchPrograms, requireTargets, tagCategoryBySlug);
  const scored = rankPrograms(survivors, criteria, tagCategoryBySlug, makePollModifier(pollStats));
  const relaxations =
    survivors.length === 0 && requireTargets.length > 0
      ? hardFilterRelaxations(matchPrograms, requireTargets, tagCategoryBySlug)
      : [];

  return { survivorCount: survivors.length, totalCount: matchPrograms.length, scored, relaxations };
}
