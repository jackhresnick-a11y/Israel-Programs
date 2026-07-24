import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSiteContent } from "@/lib/siteContent";
import { getProgramPollConfig, getQuestionsForProgram } from "@/lib/pollConfig";
import { computeBestForPhrases, computeVarianceNote, type BestForQuestionInput } from "@/lib/pollBestFor";
import { listPublicStandaloneReviews, type PublicStandaloneReview } from "@/lib/reviews";
import {
  flattenResolvedQuestionIds,
  type PollSummaryDTO,
  type PollSummaryQuestionDTO,
  type PollSummaryBucketDTO,
  type PollReviewGroupDTO,
  type RatingCoverageRow,
} from "@/lib/pollShared";

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

const EMPTY_SUMMARY: PollSummaryDTO = {
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
 */
export const getProgramPollSummary = cache(async (programId: string): Promise<PollSummaryDTO> => {
  const [config, killSwitchOn] = await Promise.all([getProgramPollConfig(programId), isPollKillSwitchOn()]);

  const visible = config.resultsVisible && !killSwitchOn;
  if (!visible) return EMPTY_SUMMARY;

  const [resolved, coreBucket, answerStats] = await Promise.all([
    getQuestionsForProgram(programId),
    prisma.questionBucket.findFirst({ where: { isCore: true }, select: { id: true, name: true } }),
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
    })),
    ...resolved.extras.flatMap(({ bucket, questions: bucketQuestions }) =>
      bucketQuestions.map((question) => ({ question, bucketId: bucket.id, bucketName: bucket.name }))
    ),
  ].filter(({ question }) => question.key !== OVERALL_QUESTION_KEY);

  const statsByQuestionId = new Map(answerStats.map((s) => [s.questionId, s]));

  const questions: PollSummaryQuestionDTO[] = flat.map(({ question, bucketId }) => {
    const stats = statsByQuestionId.get(question.id);
    return {
      key: question.key,
      text: question.text,
      mean: stats?._avg.value ?? null,
      count: stats?._count._all ?? 0,
      scaleType: question.scaleType,
      bucketId,
      labels: question.labels,
    };
  });

  // Legend: distinct buckets behind the resolved questions, in resolved order.
  const buckets: PollSummaryBucketDTO[] = [];
  const seenBucketIds = new Set<string>();
  for (const { bucketId, bucketName } of flat) {
    if (!bucketId || !bucketName) continue;
    if (!seenBucketIds.has(bucketId)) {
      seenBucketIds.add(bucketId);
      buckets.push({ id: bucketId, name: bucketName });
    }
  }

  const bestForCandidates: BestForQuestionInput[] = flat
    .filter(({ question }) => question.scaleType === "DESCRIPTIVE")
    .map(({ question }) => {
      const stats = statsByQuestionId.get(question.id);
      return {
        key: question.key,
        mean: stats?._avg.value ?? null,
        count: stats?._count._all ?? 0,
        lowPhrase: question.lowPhrase,
        highPhrase: question.highPhrase,
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
  };
});

/**
 * Every published program with its rating-response count, for the admin coverage
 * overview (/admin/polls/coverage). `count` mirrors the publish gate in
 * getProgramPollSummary: COUNTED responses that answered the `overall` question -- the
 * same measure that unlocks a public score -- not raw PollResponse rows (a response that
 * skipped `overall` doesn't move a program toward a publishable rating).
 *
 * Three set-based queries, no per-program loop: the `overall` question id, the full
 * published-program list, and one grouped count keyed by programId. Programs with no
 * qualifying responses don't appear in the grouped result and are backfilled to 0.
 * Sorted ascending by count so the programs most in need of responses sort to the top.
 */
export async function listRatingCoverage(): Promise<RatingCoverageRow[]> {
  const [overallQuestion, programs] = await Promise.all([
    prisma.pollQuestion.findUnique({ where: { key: "overall" }, select: { id: true } }),
    prisma.program.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  // Without an `overall` question no program can accrue a publishable rating, so every
  // count is 0 -- skip the grouped query entirely.
  const countByProgramId = new Map<string, number>();
  if (overallQuestion) {
    const grouped = await prisma.pollResponse.groupBy({
      by: ["programId"],
      where: {
        status: "COUNTED",
        answers: { some: { questionId: overallQuestion.id } },
      },
      _count: { _all: true },
    });
    for (const g of grouped) countByProgramId.set(g.programId, g._count._all);
  }

  return programs
    .map((p) => ({ id: p.id, name: p.name, slug: p.slug, count: countByProgramId.get(p.id) ?? 0 }))
    .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));
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
 * question) and standalone written reviews together, both gated identically. See
 * getProgramReviewsSummary below. */
export type ProgramReviewsSummaryDTO = {
  pollGroups: PollReviewGroupDTO[];
  standaloneReviews: PublicStandaloneReview[];
};

/**
 * The program page reviews section's data -- gates on kill switch off AND
 * `resultsVisible` true, deliberately *not* the minResponsesToPublish threshold the
 * score itself additionally requires: every review (poll or standalone) was
 * individually approved by an admin, so a program can show a couple of reviews while
 * its score is still collecting toward the publish threshold. Short-circuits to an
 * empty result without querying either PollReview or Review at all when the gate
 * fails, same "don't do the expensive aggregation unless it'll actually render"
 * posture as getProgramPollSummary. Both review types share this one gate -- there is
 * no separate visibility toggle for standalone reviews.
 */
export async function getProgramReviewsSummary(programId: string): Promise<ProgramReviewsSummaryDTO> {
  const [config, killSwitchOn] = await Promise.all([getProgramPollConfig(programId), isPollKillSwitchOn()]);
  if (killSwitchOn || !config.resultsVisible) return { pollGroups: [], standaloneReviews: [] };

  const [pollGroups, standaloneReviews] = await Promise.all([
    listPublicReviews(programId),
    listPublicStandaloneReviews(programId),
  ]);
  return { pollGroups, standaloneReviews };
}
