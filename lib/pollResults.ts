import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSiteContent } from "@/lib/siteContent";
import { getProgramPollConfig } from "@/lib/pollConfig";
import { summaryState } from "@/lib/pollFormat";
import type { PollSummaryDTO } from "@/lib/pollShared";

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
 * are `status = COUNTED` AND `verified = true` -- every query below is scoped to that
 * pair. Per-question means and the overall histogram are only computed when the state
 * is actually "published" (results unlock at minResponsesToPublish, gated by
 * resultsVisible AND the kill switch) -- the common "ships dark" case needs only the
 * counted-verified count, not the full aggregation.
 */
export const getProgramPollSummary = cache(async (programId: string): Promise<PollSummaryDTO> => {
  const [config, killSwitchOn, countedVerified] = await Promise.all([
    getProgramPollConfig(programId),
    isPollKillSwitchOn(),
    prisma.pollResponse.count({ where: { programId, status: "COUNTED", verified: true } }),
  ]);

  const state = summaryState(countedVerified, config.minResponsesToPublish, config.resultsVisible, killSwitchOn);

  const base: PollSummaryDTO = {
    state,
    countedVerified,
    minResponsesToPublish: config.minResponsesToPublish,
    displayFormat: config.displayFormat,
    placeholderOverride: config.placeholderOverride,
    overallMean: null,
    questions: [],
    overallHistogram: EMPTY_HISTOGRAM,
  };

  if (state !== "published") return base;

  const answerStats = await prisma.pollAnswer.groupBy({
    by: ["questionId"],
    where: { response: { programId, status: "COUNTED", verified: true } },
    _avg: { value: true },
    _count: { _all: true },
  });

  const questionRows = await prisma.pollQuestion.findMany({
    where: { id: { in: answerStats.map((s) => s.questionId) } },
    select: { id: true, key: true, text: true },
  });
  const questionById = new Map(questionRows.map((q) => [q.id, q]));

  const questions = answerStats
    .map((s) => {
      const q = questionById.get(s.questionId);
      if (!q || s._avg.value === null) return null;
      return { key: q.key, text: q.text, mean: s._avg.value, count: s._count._all };
    })
    .filter((q): q is PollSummaryDTO["questions"][number] => q !== null);

  const overallQuestion = await prisma.pollQuestion.findUnique({ where: { key: "overall" }, select: { id: true } });

  const overallHistogram: [number, number, number, number, number] = [...EMPTY_HISTOGRAM];
  let overallMean: number | null = null;

  if (overallQuestion) {
    const histRows = await prisma.pollAnswer.groupBy({
      by: ["value"],
      where: { questionId: overallQuestion.id, response: { programId, status: "COUNTED", verified: true } },
      _count: { _all: true },
    });
    for (const row of histRows) {
      if (row.value >= 1 && row.value <= 5) overallHistogram[row.value - 1] = row._count._all;
    }
    overallMean = questions.find((q) => q.key === "overall")?.mean ?? null;
  }

  return { ...base, questions, overallMean, overallHistogram };
});
