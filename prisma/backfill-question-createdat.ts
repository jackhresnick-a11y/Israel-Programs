/**
 * One-time backfill for PollQuestion.createdAt, run once immediately after the migration
 * that adds the column (which defaults every existing row to the migration's own run
 * time -- useless for historical comparisons, since it would make every pre-existing
 * question look like it was created "now"). Backfills each question to the earliest
 * PollAnswer/PollReview response that references it -- a defensible upper-bound estimate
 * (the question must have existed by the time it was first answered). A question with
 * no answers/reviews at all is left at the migration's default timestamp; harmless,
 * since a never-answered question can never have contributed to any response's
 * "answered" set regardless of its createdAt (see lib/pollUnlock.ts's
 * resolveHistoricalCoreQuestionIds).
 *
 * Idempotent to re-run (always recomputes from the same source data), but only ever
 * needs running once, right after 20260730145149_add_question_createdat_and_grandfathered_questions
 * is applied. Requires DATABASE_URL in the environment -- see CLAUDE.md's "Database"
 * section for the `set -a && source .env ...` convention plain tsx scripts need.
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const questions = await prisma.pollQuestion.findMany({ select: { id: true, key: true } });
  let backfilled = 0;
  let leftAtDefault = 0;

  for (const q of questions) {
    const [earliestAnswer, earliestReview] = await Promise.all([
      prisma.pollAnswer.findFirst({
        where: { questionId: q.id },
        select: { response: { select: { createdAt: true } } },
        orderBy: { response: { createdAt: "asc" } },
      }),
      prisma.pollReview.findFirst({
        where: { questionId: q.id },
        select: { response: { select: { createdAt: true } } },
        orderBy: { response: { createdAt: "asc" } },
      }),
    ]);
    const candidates = [earliestAnswer?.response.createdAt, earliestReview?.response.createdAt].filter(
      (d): d is Date => d !== undefined
    );
    if (candidates.length === 0) {
      leftAtDefault++;
      continue;
    }
    const earliest = candidates.reduce((a, b) => (a < b ? a : b));
    await prisma.pollQuestion.update({ where: { id: q.id }, data: { createdAt: earliest } });
    backfilled++;
    console.log(`  ${q.key}: createdAt -> ${earliest.toISOString()}`);
  }

  console.log(`\nBackfilled ${backfilled} questions to their earliest answer/review date.`);
  console.log(`${leftAtDefault} questions left at migration-run-time default (never answered/reviewed).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
