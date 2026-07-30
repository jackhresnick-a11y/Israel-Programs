/**
 * One-time backfill for ProgramPollConfig.grandfatheredQuestionIds, run once immediately
 * after the migration that adds the column (and after backfill-question-createdat.ts,
 * though the two are independent). For every existing ProgramPollConfig row, marks every
 * question with count >= 3 (COUNTED answers, today, before the 7-response publish bar
 * takes effect) as grandfathered -- so a question already displaying under the old
 * shared floor keeps displaying once minResponsesToPublish (7) becomes the real
 * per-question gate, instead of silently going dark. A question that's never yet
 * published (count < 3) is left ungrandfathered, subject to the 7 bar like normal.
 *
 * Deliberately never re-run automatically and never touched again after this: it's a
 * one-way "already earned its spot" list, not a live recomputation (see the schema
 * field's own doc comment). Requires DATABASE_URL in the environment.
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const configs = await prisma.programPollConfig.findMany({ select: { programId: true } });
  let touched = 0;
  let totalGrandfathered = 0;

  for (const { programId } of configs) {
    const stats = await prisma.pollAnswer.groupBy({
      by: ["questionId"],
      where: { response: { programId, status: "COUNTED" } },
      _count: { _all: true },
    });
    const grandfathered = stats.filter((s) => s._count._all >= 3).map((s) => s.questionId);
    if (grandfathered.length > 0) {
      await prisma.programPollConfig.update({
        where: { programId },
        data: { grandfatheredQuestionIds: grandfathered },
      });
      touched++;
      totalGrandfathered += grandfathered.length;
      console.log(`  ${programId}: grandfathered ${grandfathered.length} question(s)`);
    }
  }

  console.log(`\nTouched ${touched} ProgramPollConfig rows.`);
  console.log(`Total (program, question) pairs grandfathered: ${totalGrandfathered}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
