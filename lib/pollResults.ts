import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSiteContent } from "@/lib/siteContent";
import { getProgramPollConfig, getQuestionsForProgram } from "@/lib/pollConfig";
import { summaryState } from "@/lib/pollFormat";
import { listPublicStandaloneReviews, type PublicStandaloneReview } from "@/lib/reviews";
import {
  flattenResolvedQuestionIds,
  type PollSummaryDTO,
  type PollSummaryQuestionDTO,
  type PollSummaryBucketDTO,
  type PollReviewGroupDTO,
  type RatingCoverageRow,
} from "@/lib/pollShared";

export const POLL_KILL_SWITCH_KEY = "pollResultsKillSwitch";

/** One setting that hides all results everywhere regardless of per-program config --
 * the global kill switch from /admin/polls/moderation. Same string-boolean convention
 * as every other SiteContent flag in this codebase. */
export async function isPollKillSwitchOn(): Promise<boolean> {
  const value = await getSiteContent(POLL_KILL_SWITCH_KEY);
  return value === "true";
}

const EMPTY_HISTOGRAM: [number, number, number, number, number] = [0, 0, 0, 0, 0];

/**
 * The program page summary strip's data. Public math only ever counts responses that
 * are `status = COUNTED` -- every query below is scoped to that. `verified` is no
 * longer part of the count gate (see the PollResponse doc comment in schema.prisma):
 * a signed-in response is COUNTED+verified immediately as before, and an anonymous
 * link response is now COUNTED (verified stays false) unless a submit-time anti-abuse
 * check routed it to FLAGGED instead -- so COUNTED alone is the complete, correct gate.
 * Per-question means and the overall histogram are only computed when the state is
 * actually "published" (results unlock at minResponsesToPublish, gated by
 * resultsVisible AND the kill switch) -- the common "ships dark" case needs only the
 * overall-answer count, not the full aggregation.
 *
 * `questions` is built from the program's live *resolved* question set
 * (getQuestionsForProgram), not just questions that happen to have answers -- so a
 * newly-added or so-far-unanswered question still gets a circle (mean: null, count: 0,
 * rendered as "---" by the results grid) instead of silently vanishing. Each entry
 * carries its owning bucket id (core questions get the core bucket's id) for the
 * results grid's per-bucket coloring, plus its `scaleType` + full `labels` (all 5) so a
 * DESCRIPTIVE question can render as a spectrum track labeled with the two rungs nearest
 * its mean. `buckets` is the distinct, ordered set of buckets
 * behind the non-"overall"
 * questions -- the results grid's color legend.
 *
 * The publish gate, headline, and progress bar all read the count of COUNTED
 * responses that *answered* the `overall` question -- not the count of COUNTED
 * responses overall. Since questions became skippable, a response can be COUNTED but
 * have skipped `overall` entirely; counting it toward the gate would publish a score
 * partly built on responses that never actually rated "overall," and the headline
 * number wouldn't match what the histogram/mean are computed from. A program whose
 * config has removed `overall` entirely reads 0 here and stays in "be_first" -- a
 * deliberate, if unusual, consequence of the gate always being anchored to that one
 * question.
 */
export const getProgramPollSummary = cache(async (programId: string): Promise<PollSummaryDTO> => {
  const [config, killSwitchOn, overallQuestion] = await Promise.all([
    getProgramPollConfig(programId),
    isPollKillSwitchOn(),
    prisma.pollQuestion.findUnique({ where: { key: "overall" }, select: { id: true } }),
  ]);

  const counted = overallQuestion
    ? await prisma.pollAnswer.count({
        where: { questionId: overallQuestion.id, response: { programId, status: "COUNTED" } },
      })
    : 0;

  const state = summaryState(counted, config.minResponsesToPublish, config.resultsVisible, killSwitchOn);

  const base: PollSummaryDTO = {
    state,
    counted,
    minResponsesToPublish: config.minResponsesToPublish,
    displayFormat: config.displayFormat,
    placeholderOverride: config.placeholderOverride,
    overallMean: null,
    questions: [],
    buckets: [],
    overallHistogram: EMPTY_HISTOGRAM,
  };

  if (state !== "published") return base;

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
  // rating form itself uses.
  const flat = [
    ...resolved.core.map((question) => ({
      question,
      bucketId: coreBucket?.id ?? null,
      bucketName: coreBucket?.name ?? null,
    })),
    ...resolved.extras.flatMap(({ bucket, questions: bucketQuestions }) =>
      bucketQuestions.map((question) => ({ question, bucketId: bucket.id, bucketName: bucket.name }))
    ),
  ];

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

  // Legend: distinct buckets behind the non-"overall" questions, in resolved order.
  const buckets: PollSummaryBucketDTO[] = [];
  const seenBucketIds = new Set<string>();
  for (const { question, bucketId, bucketName } of flat) {
    if (question.key === "overall" || !bucketId || !bucketName) continue;
    if (!seenBucketIds.has(bucketId)) {
      seenBucketIds.add(bucketId);
      buckets.push({ id: bucketId, name: bucketName });
    }
  }

  const overallHistogram: [number, number, number, number, number] = [...EMPTY_HISTOGRAM];
  let overallMean: number | null = null;

  if (overallQuestion) {
    const histRows = await prisma.pollAnswer.groupBy({
      by: ["value"],
      where: { questionId: overallQuestion.id, response: { programId, status: "COUNTED" } },
      _count: { _all: true },
    });
    for (const row of histRows) {
      if (row.value >= 1 && row.value <= 5) overallHistogram[row.value - 1] = row._count._all;
    }
    overallMean = questions.find((q) => q.key === "overall")?.mean ?? null;
  }

  return { ...base, questions, buckets, overallMean, overallHistogram };
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
