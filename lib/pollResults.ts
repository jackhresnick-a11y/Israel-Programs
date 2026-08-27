import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSiteContent } from "@/lib/siteContent";
import { getProgramPollConfig, getQuestionsForProgram, getQuestionsForPrograms } from "@/lib/pollConfig";
import { computeBestForPhrases, computeVarianceNote, type BestForQuestionInput } from "@/lib/pollBestFor";
import { responseMeetsHistoricalSpread, type HistoricalQuestion } from "@/lib/pollUnlock";
import { listPublicStandaloneReviews, type PublicStandaloneReview } from "@/lib/reviews";
import { listPublicElaborations, type ElaborationGroupDTO } from "@/lib/pollElaborations";
import {
  flattenResolvedQuestionIds,
  MIN_RESPONSES_FOR_RATING,
  type PollSummaryDTO,
  type PollSummaryQuestionDTO,
  type PollSummaryBucketDTO,
  type PollReviewGroupDTO,
  type RatingCoverageRow,
} from "@/lib/pollShared";
import { computeClusterSignal, type ClusterResponseInput } from "@/lib/pollClustering";
import type { TagProvenanceSource } from "@/lib/tagProvenanceShared";
import { emptyIfTableMissing } from "@/lib/tagProvenance";

/** The one question every program's poll always carries (see the Core bucket seed) whose
 * answers we deliberately never surface -- no aggregate/overall scored number appears
 * anywhere on the public page (see PollSummaryDTO's doc comment). Still resolved and
 * answerable via the rating form; simply excluded from the results grid and from the
 * "Best for" strip's candidate pool below. */
const OVERALL_QUESTION_KEY = "overall";

/** The DESCRIPTIVE question whose mean drives the neutral "Experiences vary depending on
 * staff." note -- see lib/pollBestFor.ts's computeVarianceNote. */
const STAFF_VARIANCE_QUESTION_KEY = "staff_dependent";

export const POLL_KILL_SWITCH_KEY = "pollResultsKillSwitch";

/** One setting that hides all results everywhere regardless of per-program config --
 * the global kill switch from /admin/polls/moderation. Same string-boolean convention
 * as every other SiteContent flag in this codebase. */
export async function isPollKillSwitchOn(): Promise<boolean> {
  const value = await getSiteContent(POLL_KILL_SWITCH_KEY);
  return value === "true";
}

/** Everything but `responseCount`, which varies per program even in the empty-visibility
 * path (see getProgramPollSummary) and so can't be baked into a shared constant. */
const EMPTY_SUMMARY_BASE: Omit<PollSummaryDTO, "responseCount"> = {
  visible: false,
  questions: [],
  buckets: [],
  bestForPhrases: [],
  editorialBestFor: null,
  varianceNote: false,
};

/**
 * The program page's survey-results data. Public math only ever counts responses that
 * are `status = COUNTED` -- every query below is scoped to that. `verified` is no
 * longer part of the count gate (see the PollResponse doc comment in schema.prisma):
 * a signed-in response is COUNTED+verified immediately as before, and an anonymous
 * link response is now COUNTED (verified stays false) unless a submit-time anti-abuse
 * check routed it to FLAGGED instead -- so COUNTED alone is the complete, correct gate.
 *
 * The only remaining visibility gate is `resultsVisible AND !killSwitch` -- there is
 * deliberately no `minResponsesToPublish`/`overall`-answer-count publish threshold
 * anymore: each question stands on its own response count (see
 * components/PollSummaryStrip.tsx's MIN_RESPONSES_PER_QUESTION, which suppresses an
 * individual question below n=3), so there's no single "is this program ready" gate to
 * compute or wait for. When the visibility gate fails, this short-circuits to
 * EMPTY_SUMMARY without the aggregation queries at all -- same "don't do the expensive
 * work unless it'll actually render" posture the old publish gate had.
 *
 * `questions` is built from the program's live *resolved* question set
 * (getQuestionsForProgram), not just questions that happen to have answers -- so a
 * newly-added or so-far-unanswered question still gets a block (mean: null, count: 0)
 * instead of silently vanishing. Each entry carries its owning bucket id (core questions
 * get the core bucket's id) for the results grid's per-bucket coloring, plus its
 * `scaleType` + full `labels` (all 5). The `overall` question is resolved (still
 * answerable via the rating form) but excluded here and from every aggregate computed
 * below -- no scored number anywhere on the public page.
 *
 * `bestForPhrases` and `varianceNote` are computed here (see lib/pollBestFor.ts) rather
 * than in the component so the ranking/threshold logic has exactly one call site.
 *
 * `responseCount` (COUNTED PollResponse rows for this program) is computed BEFORE the
 * visibility short-circuit and returned either way -- the CTA region's social-proof line
 * must be able to show "N people have rated this program" even when results are hidden
 * or still collecting (see lib/contactOptIn.ts's deriveCtaLayout, which is what actually
 * decides whether to render it). This is the one query the empty-visibility path still
 * pays for; everything else stays skipped.
 */
export const getProgramPollSummary = cache(async (programId: string): Promise<PollSummaryDTO> => {
  const [config, killSwitchOn, responseCount] = await Promise.all([
    getProgramPollConfig(programId),
    isPollKillSwitchOn(),
    prisma.pollResponse.count({ where: { programId, status: "COUNTED" } }),
  ]);

  const visible = config.resultsVisible && !killSwitchOn;
  if (!visible) return { ...EMPTY_SUMMARY_BASE, responseCount };

  const [resolved, coreBucket, answerStats] = await Promise.all([
    getQuestionsForProgram(programId),
    prisma.questionBucket.findFirst({
      where: { isCore: true },
      select: { id: true, name: true, description: true, order: true, isCore: true, status: true },
    }),
    prisma.pollAnswer.groupBy({
      by: ["questionId"],
      where: { response: { programId, status: "COUNTED" } },
      _avg: { value: true },
      _count: { _all: true },
    }),
  ]);

  // Flatten the resolved set (core first, then extras) into one ordered list, each
  // question paired with the bucket it's presented under -- the same order the
  // rating form itself uses. The "overall" question is dropped here, at the source, so
  // no downstream computation (results grid, best-for candidates, buckets legend) can
  // accidentally pick it up.
  const flat = [
    ...resolved.core.map((question) => ({
      question,
      bucketId: coreBucket?.id ?? null,
      bucketName: coreBucket?.name ?? null,
      bucketDescription: coreBucket?.description ?? null,
      bucketOrder: coreBucket?.order ?? null,
      bucketIsCore: coreBucket?.isCore ?? false,
      bucketRetired: coreBucket?.status === "RETIRED",
      isCurrent: true,
    })),
    ...resolved.extras.flatMap(({ bucket, questions: bucketQuestions }) =>
      bucketQuestions.map((question) => ({
        question,
        bucketId: bucket.id,
        bucketName: bucket.name,
        bucketDescription: bucket.description,
        bucketOrder: bucket.order,
        bucketIsCore: bucket.isCore,
        bucketRetired: bucket.status === "RETIRED",
        isCurrent: true,
      }))
    ),
  ].filter(({ question }) => question.key !== OVERALL_QUESTION_KEY);

  const statsByQuestionId = new Map(answerStats.map((s) => [s.questionId, s]));

  // A retired question is dropped from the live-resolved set (resolvePollQuestionSet
  // filters to ACTIVE only -- correct for the rating form, which must never serve a
  // retired question to a new respondent) but its PollAnswer rows still exist and are
  // still counted in `answerStats` above (a raw, status-agnostic groupBy). Without this,
  // retiring a question would also silently erase its historical result from every
  // program page that already displays it -- the actual gap this closes: retired
  // questions are never served going forward, but their existing results keep showing
  // with their existing n. Any answered question id not already covered by the live-
  // resolved set is "orphaned" (retired, or otherwise no longer resolvable) and gets
  // fetched directly, with no status filter.
  const resolvedIds = new Set(flat.map(({ question }) => question.id));
  const orphanedIds = answerStats.map((s) => s.questionId).filter((id) => !resolvedIds.has(id));
  const orphanedQuestions =
    orphanedIds.length > 0
      ? await prisma.pollQuestion.findMany({
          where: { id: { in: orphanedIds } },
          select: { id: true, key: true, text: true, scaleType: true, labels: true },
        })
      : [];

  // A retired question's bucket is found by scanning ALL buckets (any status), not just
  // the live-resolved set -- it may still be listed in its original bucket's
  // questionIds array even though the question itself is retired (retiring is a status
  // flag on PollQuestion, not a structural removal from the bucket). If no bucket lists
  // it anymore, it renders ungrouped (bucketId: null), same fallback the results grid
  // already has for any unmatched bucket.
  const allBuckets =
    orphanedQuestions.length > 0
      ? await prisma.questionBucket.findMany({
          select: { id: true, name: true, description: true, order: true, isCore: true, status: true, questionIds: true },
        })
      : [];
  function findBucketFor(questionId: string) {
    return allBuckets.find((b) => b.questionIds.includes(questionId)) ?? null;
  }

  const flatWithOrphans = [
    ...flat,
    ...orphanedQuestions
      .filter((q) => q.key !== OVERALL_QUESTION_KEY)
      .map((question) => {
        const bucket = findBucketFor(question.id);
        return {
          question,
          bucketId: bucket?.id ?? null,
          bucketName: bucket?.name ?? null,
          bucketDescription: bucket?.description ?? null,
          bucketOrder: bucket?.order ?? null,
          bucketIsCore: bucket?.isCore ?? false,
          bucketRetired: bucket?.status === "RETIRED",
          isCurrent: false,
        };
      }),
  ];

  const grandfatheredIds = new Set(config.grandfatheredQuestionIds);
  const questions: PollSummaryQuestionDTO[] = flatWithOrphans.map(({ question, bucketId, isCurrent }) => {
    const stats = statsByQuestionId.get(question.id);
    const count = stats?._count._all ?? 0;
    return {
      key: question.key,
      text: question.text,
      mean: stats?._avg.value ?? null,
      count,
      scaleType: question.scaleType,
      bucketId,
      labels: question.labels,
      published: count >= config.minResponsesToPublish || grandfatheredIds.has(question.id),
      isCurrent,
    };
  });

  // Legend: distinct buckets behind the resolved questions, in resolved order.
  const buckets: PollSummaryBucketDTO[] = [];
  const seenBucketIds = new Set<string>();
  for (const { bucketId, bucketName, bucketDescription, bucketOrder, bucketIsCore, bucketRetired } of flatWithOrphans) {
    if (!bucketId || !bucketName || bucketOrder === null) continue;
    if (!seenBucketIds.has(bucketId)) {
      seenBucketIds.add(bucketId);
      buckets.push({
        id: bucketId,
        name: bucketName,
        description: bucketDescription,
        order: bucketOrder,
        isCore: bucketIsCore,
        retired: bucketRetired,
      });
    }
  }

  // Every resolved non-"overall" question is a strip candidate -- eligibility is driven
  // entirely by tier/phrases/response-count (see lib/pollBestFor.ts), not by scaleType.
  // An EVALUATIVE question (e.g. "did Hebrew stick") can contribute a strip phrase while
  // still rendering as a donut in the results grid below; scaleType only ever picks
  // donut-vs-track rendering, never strip eligibility.
  const bestForCandidates: BestForQuestionInput[] = flat.map(({ question }) => {
    const stats = statsByQuestionId.get(question.id);
    return {
      key: question.key,
      mean: stats?._avg.value ?? null,
      count: stats?._count._all ?? 0,
      lowPhrase: question.lowPhrase,
      highPhrase: question.highPhrase,
      tier: question.tier,
    };
  });

  const bestForPhrases = computeBestForPhrases(bestForCandidates);
  const varianceNote = computeVarianceNote(
    bestForCandidates.find((q) => q.key === STAFF_VARIANCE_QUESTION_KEY)
  );

  return {
    visible,
    questions,
    buckets,
    bestForPhrases,
    editorialBestFor: config.editorialBestFor ?? null,
    varianceNote,
    responseCount,
  };
});

/**
 * How many COUNTED responses for this program opted in to being contacted -- used only
 * for the Alumni References section's aggregate hint (see lib/contactOptIn.ts's
 * shouldShowContactHint), never rendered as a number itself. Deliberately not gated on
 * `resultsVisible`/the kill switch (unlike getProgramPollSummary) -- whether someone is
 * reachable is independent of whether the poll's scored results are public.
 */
export async function countOpenContactOptIns(programId: string): Promise<number> {
  return prisma.pollResponse.count({ where: { programId, status: "COUNTED", contactOptIn: true } });
}

/** One respondent's contact opt-in, as shown to a moderator on /admin/programs -- never
 * rendered publicly (see lib/contactOptIn.ts's doc comment on the naming split from the
 * heavier Reference system). Both timestamps are surfaced separately since consent and
 * the 18+ self-attestation are recorded as two distinct assertions. */
export type ContactOptInRow = {
  contactName: string;
  contactMethod: string;
  contactOptInAt: Date;
  contactAgeAttestedAt: Date;
};

/** Admin-only, /admin/programs' inline tag-provenance editor -- never selected into any
 * public read (see ProgramTagProvenance's schema doc comment: there is no relation field
 * to reach this from a Program query in the first place). */
export type ProgramTagProvenanceRow = {
  tagId: string;
  source: TagProvenanceSource;
  sourceUrl: string | null;
  note: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
};

/** One program's row on /admin/programs -- the live-computed strip alongside the
 * editorial override, so an admin can see at a glance which programs are relying on the
 * generated strip vs. a manual override, and how thin each program's data still is. */
export type ProgramBestForRow = {
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

/**
 * Every PUBLISHED program's live-computed "Best for" strip, for /admin/programs --
 * batched (one PollQuestion fetch + one PollAnswer fetch, folded in JS below), not
 * getProgramPollSummary called once per program, which would be 461 separate
 * aggregations for the full catalog. Deliberately does NOT read resultsVisible/kill
 * switch here -- this view exists so an admin can see what a program's strip *would*
 * say even before turning results on for the public, which is the whole point of the
 * accompanying live-preview screen at /admin/poll-questions.
 *
 * `responseCount` is the number of distinct COUNTED PollResponse rows for the program
 * (any question answered), not any one question's n -- a coarse "how much data exists
 * at all" signal for sorting, not a per-question figure.
 */
export async function listProgramsBestFor(): Promise<ProgramBestForRow[]> {
  const [programs, questions, answerRows, contactOptInRows, provenanceRows] = await Promise.all([
    prisma.program.findMany({
      where: { status: "PUBLISHED" },
      select: {
        id: true,
        name: true,
        slug: true,
        organization: true,
        location: true,
        tags: { select: { id: true, slug: true, name: true } },
        pollConfig: { select: { editorialBestFor: true } },
        // Explicit opt-in select, the deliberate admin-side exception to
        // PROGRAM_PRIVATE_OMIT (lib/programs.ts) -- this view is /admin/programs,
        // gated admin-only, and is exactly where a moderator curates these.
        videoUrl: true,
        videoCredit: true,
        videoCreditUrl: true,
        videoTranscript: true,
        aiBrief: true,
        transcriptTags: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.pollQuestion.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, key: true, tier: true, lowPhrase: true, highPhrase: true },
    }),
    // Every COUNTED answer's raw value, scoped to (programId, questionId) -- Prisma's
    // groupBy can't group by a related model's field (PollAnswer has no programId column
    // of its own, only via response), so the per-(program, question) mean/count is folded
    // in JS below instead of a second query per program.
    prisma.pollAnswer.findMany({
      where: { response: { status: "COUNTED" } },
      select: { questionId: true, value: true, response: { select: { programId: true } } },
    }),
    // One batched fetch of every opt-in-carrying response, not a query per program --
    // same posture as the answer query above. contactMethod/contactName/
    // contactAgeAttestedAt are guaranteed non-null here since they're only ever written
    // together with contactOptIn=true (see lib/contactOptIn.ts's buildContactOptInFields).
    prisma.pollResponse.findMany({
      where: { status: "COUNTED", contactOptIn: true },
      select: { programId: true, contactName: true, contactMethod: true, contactOptInAt: true, contactAgeAttestedAt: true },
    }),
    // Batched, same posture as contactOptInRows above -- one fetch for every program's
    // tag-provenance rows rather than a query per program. Admin-only (see
    // ProgramTagProvenanceRow's doc comment); this is /admin/programs, gated admin-only.
    emptyIfTableMissing(
      () =>
        prisma.programTagProvenance.findMany({
          select: { programId: true, tagId: true, source: true, sourceUrl: true, note: true, verifiedAt: true, verifiedBy: true },
        }),
      []
    ),
  ]);

  const provenanceByProgramId = new Map<string, ProgramTagProvenanceRow[]>();
  for (const row of provenanceRows) {
    const list = provenanceByProgramId.get(row.programId) ?? [];
    list.push({
      tagId: row.tagId,
      source: row.source,
      sourceUrl: row.sourceUrl,
      note: row.note,
      verifiedAt: row.verifiedAt,
      verifiedBy: row.verifiedBy,
    });
    provenanceByProgramId.set(row.programId, list);
  }

  const contactOptInsByProgramId = new Map<string, ContactOptInRow[]>();
  for (const row of contactOptInRows) {
    if (!row.contactName || !row.contactMethod || !row.contactOptInAt || !row.contactAgeAttestedAt) continue;
    const list = contactOptInsByProgramId.get(row.programId) ?? [];
    list.push({
      contactName: row.contactName,
      contactMethod: row.contactMethod,
      contactOptInAt: row.contactOptInAt,
      contactAgeAttestedAt: row.contactAgeAttestedAt,
    });
    contactOptInsByProgramId.set(row.programId, list);
  }

  const statsByProgramId = new Map<string, Map<string, { sum: number; n: number }>>();
  for (const row of answerRows) {
    const programId = row.response.programId;
    if (!statsByProgramId.has(programId)) statsByProgramId.set(programId, new Map());
    const perQuestion = statsByProgramId.get(programId)!;
    const existing = perQuestion.get(row.questionId) ?? { sum: 0, n: 0 };
    perQuestion.set(row.questionId, { sum: existing.sum + row.value, n: existing.n + 1 });
  }

  // Batched, same posture as every other per-program fetch on this page -- see
  // countResponsesMeetingReadinessBarByProgram's doc comment. This used to be an
  // `await countResponsesMeetingReadinessBar(p.id)` inside the map below, i.e. one
  // ~16-round-trip call per program (~7,400 queries / ~49s at the current
  // 463-published-program count).
  const responseCountsByProgramId = await countResponsesMeetingReadinessBarByProgram(
    programs.map((p) => p.id)
  );

  return programs.map((p) => {
    const programStats = statsByProgramId.get(p.id);
    const candidates: BestForQuestionInput[] = questions.map((q) => {
      const stat = programStats?.get(q.id);
      return {
        key: q.key,
        mean: stat ? stat.sum / stat.n : null,
        count: stat?.n ?? 0,
        lowPhrase: q.lowPhrase,
        highPhrase: q.highPhrase,
        tier: q.tier,
      };
    });
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      organization: p.organization,
      location: p.location,
      tags: p.tags,
      provenance: provenanceByProgramId.get(p.id) ?? [],
      // countResponsesMeetingReadinessBar -- was a raw COUNTED-row count, now the
      // same shared "genuine engagement" definition listRatingCoverage uses, so this
      // admin list and the coverage list can never disagree with each other again.
      responseCount: responseCountsByProgramId.get(p.id) ?? 0,
      bestForPhrases: computeBestForPhrases(candidates),
      editorialBestFor: p.pollConfig?.editorialBestFor ?? null,
      contactOptIns: contactOptInsByProgramId.get(p.id) ?? [],
      videoUrl: p.videoUrl,
      videoCredit: p.videoCredit,
      videoCreditUrl: p.videoCreditUrl,
      videoTranscript: p.videoTranscript,
      aiBrief: p.aiBrief,
      transcriptTags: p.transcriptTags,
    };
  });
}

/** One question's raw mean/count for one program -- the input shape the
 * /admin/poll-questions live-preview screen needs (see getProgramQuestionStats): just
 * enough to let the client recompute computeBestForPhrases against *locally-edited,
 * unsaved* tier/phrase values, which this function deliberately doesn't know about. */
export type ProgramQuestionStat = { key: string; mean: number | null; count: number };

/**
 * Every ACTIVE question's mean/count for one program, scoped to COUNTED responses --
 * used only by the /admin/poll-questions live-preview screen's fetch, not the public
 * page (that's getProgramPollSummary, which also applies the resultsVisible gate this
 * function deliberately skips: an admin previewing a tier change needs to see the
 * strip regardless of whether results are currently public). Every ACTIVE question is
 * included, even ones the program's current poll config wouldn't resolve today, since
 * past answers stay attributable to the wording/config they were actually given under
 * (same posture as the rest of this file) -- a stray answer from a since-removed
 * question still shouldn't silently vanish from an admin's preview.
 */
export async function getProgramQuestionStats(programId: string): Promise<ProgramQuestionStat[]> {
  const [questions, stats] = await Promise.all([
    prisma.pollQuestion.findMany({ where: { status: "ACTIVE" }, select: { id: true, key: true } }),
    prisma.pollAnswer.groupBy({
      by: ["questionId"],
      where: { response: { programId, status: "COUNTED" } },
      _avg: { value: true },
      _count: { _all: true },
    }),
  ]);
  const statByQuestionId = new Map(stats.map((s) => [s.questionId, s]));
  return questions.map((q) => {
    const stat = statByQuestionId.get(q.id);
    return { key: q.key, mean: stat?._avg.value ?? null, count: stat?._count._all ?? 0 };
  });
}

/**
 * Batched form of countResponsesMeetingReadinessBar -- one set of bulk queries for
 * every id in `programIds` (via getQuestionsForPrograms, plus scoped
 * pollResponse/pollAnswer/pollQuestion fetches) rather than the ~16-round-trip
 * per-program version repeated once per program. At 463 published programs the
 * per-program version was ~7,400 queries and ~49s wall clock for /admin/programs alone
 * -- this is the fix. Folds every program's responses/answers in JS, then runs the
 * same unchanged responseMeetsHistoricalSpread per response, so the readiness
 * definition itself is untouched -- only the query shape changes.
 *
 * countResponsesMeetingReadinessBar (below) is now a thin one-id wrapper over this, so
 * the two can never drift apart -- same invariant the shared-definition doc comment on
 * this function's non-batched predecessor already called out.
 */
export async function countResponsesMeetingReadinessBarByProgram(
  programIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (programIds.length === 0) return result;

  const resolvedByProgramId = await getQuestionsForPrograms(programIds);

  const bucketGroupsByProgramId = new Map<string, string[][]>();
  const allIdsByProgramId = new Map<string, string[]>();
  const everyQuestionId = new Set<string>();
  for (const programId of programIds) {
    const resolved = resolvedByProgramId.get(programId);
    const bucketGroups = resolved
      ? [resolved.core.map((q) => q.id), ...resolved.extras.map((e) => e.questions.map((q) => q.id))]
      : [];
    const allIds = [...new Set(bucketGroups.flat())];
    bucketGroupsByProgramId.set(programId, bucketGroups);
    allIdsByProgramId.set(programId, allIds);
    for (const id of allIds) everyQuestionId.add(id);
    result.set(programId, 0);
  }
  if (everyQuestionId.size === 0) return result;

  const [questions, responses, answers] = await Promise.all([
    prisma.pollQuestion.findMany({
      where: { id: { in: [...everyQuestionId] } },
      select: { id: true, status: true },
    }),
    prisma.pollResponse.findMany({
      where: { programId: { in: programIds }, status: "COUNTED" },
      select: { id: true, programId: true, naQuestionIds: true, presentedQuestionIds: true },
    }),
    prisma.pollAnswer.groupBy({
      by: ["responseId", "questionId"],
      where: { response: { programId: { in: programIds }, status: "COUNTED" } },
    }),
  ]);
  if (responses.length === 0) return result;

  const questionsById = new Map<string, HistoricalQuestion>(questions.map((q) => [q.id, q]));

  const answeredByResponse = new Map<string, Set<string>>();
  for (const a of answers) {
    if (!answeredByResponse.has(a.responseId)) answeredByResponse.set(a.responseId, new Set());
    answeredByResponse.get(a.responseId)!.add(a.questionId);
  }

  for (const r of responses) {
    const bucketGroups = bucketGroupsByProgramId.get(r.programId);
    const allIds = allIdsByProgramId.get(r.programId);
    if (!bucketGroups || !allIds || allIds.length === 0) continue;

    const answeredIds = answeredByResponse.get(r.id) ?? new Set<string>();
    const naIds = new Set(r.naQuestionIds);
    const presented = r.presentedQuestionIds.length > 0 ? r.presentedQuestionIds : allIds;
    if (responseMeetsHistoricalSpread(bucketGroups, presented, questionsById, answeredIds, naIds)) {
      result.set(r.programId, (result.get(r.programId) ?? 0) + 1);
    }
  }
  return result;
}

/**
 * How many of a program's COUNTED responses meet the historical readiness bar --
 * "genuine engagement," judged against the bucket groups EACH response was actually
 * served (via its own `presentedQuestionIds` snapshot -- see
 * lib/pollUnlock.ts's responseMeetsHistoricalSpread), not today's live buckets. This is
 * the single shared definition behind both the admin coverage list (listRatingCoverage)
 * and the admin programs list (listProgramsBestFor) -- they used to disagree (one
 * counted "answered the vestigial `overall` question," the other counted raw COUNTED
 * rows with no bar at all), which is exactly the bug this replaces both with one number.
 *
 * A thin wrapper over the batched countResponsesMeetingReadinessBarByProgram -- callers
 * needing more than one program's count should call that directly instead of looping
 * this, which is exactly the N+1 this pair of functions used to be.
 */
export async function countResponsesMeetingReadinessBar(programId: string): Promise<number> {
  const counts = await countResponsesMeetingReadinessBarByProgram([programId]);
  return counts.get(programId) ?? 0;
}

/**
 * Every published program with its rating-response count, for the admin coverage
 * overview (/admin/polls/coverage). `count` is countResponsesMeetingReadinessBar --
 * COUNTED responses that met the readiness bar as it stood when each was created --
 * replacing the old "answered the `overall` question" proxy, which had drifted far from
 * what actually gates a program's real, visible results (the `overall` question is
 * vestigial and easy to skip; a program could have many genuinely engaged responses
 * that happen to have skipped that one specific question).
 *
 * Uses the batched countResponsesMeetingReadinessBarByProgram (one set of bulk queries
 * for every published program, since each program's bucket groups can still be
 * individually customized via addedQuestionIds/removedQuestionIds -- see that
 * function's own doc comment) rather than one countResponsesMeetingReadinessBar call
 * per program, which was an N+1 at the current 463-published-program scale. Sorted
 * ascending by count so the programs most in need of responses sort to the top.
 */
export async function listRatingCoverage(): Promise<RatingCoverageRow[]> {
  const programs = await prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, name: true, slug: true },
  });

  const [countsByProgramId, clusterInputsByProgram] = await Promise.all([
    countResponsesMeetingReadinessBarByProgram(programs.map((p) => p.id)),
    loadClusterInputsByProgram(programs.map((p) => p.id)),
  ]);
  const rows = programs.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    count: countsByProgramId.get(p.id) ?? 0,
  }));

  const withCluster = rows.map((row) => ({
    ...row,
    // Advisory only, and only worth surfacing for a program still below threshold --
    // once a program has enough responses there's nothing left to advise about, and
    // computing/rendering the signal there would just be noise. See
    // lib/pollClustering.ts's module doc comment for the "advisory only, never a gate"
    // contract this must uphold.
    cluster: row.count >= MIN_RESPONSES_FOR_RATING ? null : computeClusterSignal(clusterInputsByProgram.get(row.id) ?? []),
  }));

  return withCluster.sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));
}

/** One bulk query for every published program's COUNTED responses (createdAt +
 * yearAttended only), grouped in JS -- avoids an N+1 on top of the existing per-program
 * countResponsesMeetingReadinessBar loop above. Bounded by total COUNTED responses across
 * published programs (hundreds, not thousands), same acceptable-cost posture
 * countResponsesMeetingReadinessBar's own doc comment already takes for this admin-only
 * page. Covered by the existing @@index([programId, status, verified]). */
async function loadClusterInputsByProgram(programIds: string[]): Promise<Map<string, ClusterResponseInput[]>> {
  const responses = await prisma.pollResponse.findMany({
    where: { programId: { in: programIds }, status: "COUNTED" },
    select: { programId: true, createdAt: true, yearAttended: true },
  });
  const byProgram = new Map<string, ClusterResponseInput[]>();
  for (const r of responses) {
    const list = byProgram.get(r.programId) ?? [];
    list.push({ createdAt: r.createdAt, yearAttended: r.yearAttended });
    byProgram.set(r.programId, list);
  }
  return byProgram;
}

/**
 * Approved reviews for the public program page, grouped by question and ordered by the
 * program's live (resolved) question order -- core first, then extra buckets, the same
 * order the rating form itself presents via resolvePollQuestionSet, so the reviews
 * section and the rating form never disagree about question order. A question with
 * zero approved reviews doesn't appear as an empty group. "Published" is a query-time
 * join against the parent response's live status (COUNTED only -- `verified` isn't
 * part of the gate, same as getProgramPollSummary above), not a stored flag on the
 * review row -- a voided or still-FLAGGED response's reviews are absent from this query
 * with no write to PollReview, and approving/restoring the response surfaces them
 * automatically. Selects only the fields a reader may see: never responseId, email,
 * ipHash, consent metadata, or moderator notes -- same RSC-payload-leak rule as every
 * other public/sensitive-split model in this codebase.
 */
export const listPublicReviews = cache(async (programId: string): Promise<PollReviewGroupDTO[]> => {
  const [rows, resolved] = await Promise.all([
    prisma.pollReview.findMany({
      where: {
        programId,
        status: "APPROVED",
        response: { status: "COUNTED" },
      },
      select: {
        text: true,
        questionId: true,
        question: { select: { key: true, text: true } },
        response: { select: { yearAttended: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    getQuestionsForProgram(programId),
  ]);

  if (rows.length === 0) return [];

  const byQuestionId = new Map<string, PollReviewGroupDTO>();
  for (const row of rows) {
    const existing = byQuestionId.get(row.questionId);
    const item = { text: row.text, yearAttended: row.response.yearAttended };
    if (existing) {
      existing.reviews.push(item);
    } else {
      byQuestionId.set(row.questionId, {
        questionKey: row.question.key,
        questionText: row.question.text,
        reviews: [item],
      });
    }
  }

  // Order groups by the program's resolved question order (core, then extras); a
  // review for a question no longer in that resolved set (e.g. removed from the
  // program since) still appears, appended after the ordered groups, rather than
  // silently dropped.
  const orderedQuestionIds = flattenResolvedQuestionIds(resolved);
  const ordered: PollReviewGroupDTO[] = [];
  const seen = new Set<string>();
  for (const questionId of orderedQuestionIds) {
    const group = byQuestionId.get(questionId);
    if (group) {
      ordered.push(group);
      seen.add(questionId);
    }
  }
  for (const [questionId, group] of byQuestionId) {
    if (!seen.has(questionId)) ordered.push(group);
  }

  return ordered;
});

/** The program page's unified Reviews section data -- poll reviews (grouped by
 * question), end-of-poll elaboration answers (grouped by prompt), and standalone written
 * reviews together, all gated identically. See getProgramReviewsSummary below. */
export type ProgramReviewsSummaryDTO = {
  pollGroups: PollReviewGroupDTO[];
  promptGroups: ElaborationGroupDTO[];
  standaloneReviews: PublicStandaloneReview[];
};

/**
 * The program page reviews section's data -- gates on kill switch off AND
 * `resultsVisible` true, deliberately *not* the minResponsesToPublish threshold the
 * score itself additionally requires: every review (poll, elaboration, or standalone)
 * was individually approved by an admin, so a program can show a couple of reviews while
 * its score is still collecting toward the publish threshold. Short-circuits to an
 * empty result without querying PollReview, PollElaborationAnswer, or Review at all when
 * the gate fails, same "don't do the expensive aggregation unless it'll actually render"
 * posture as getProgramPollSummary. All three share this one gate -- there is no separate
 * visibility toggle for elaboration answers or standalone reviews.
 */
export async function getProgramReviewsSummary(programId: string): Promise<ProgramReviewsSummaryDTO> {
  const [config, killSwitchOn] = await Promise.all([getProgramPollConfig(programId), isPollKillSwitchOn()]);
  if (killSwitchOn || !config.resultsVisible) return { pollGroups: [], promptGroups: [], standaloneReviews: [] };

  const [pollGroups, promptGroups, standaloneReviews] = await Promise.all([
    listPublicReviews(programId),
    listPublicElaborations(programId),
    listPublicStandaloneReviews(programId),
  ]);
  return { pollGroups, promptGroups, standaloneReviews };
}
