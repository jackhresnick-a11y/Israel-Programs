import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// The seven DESCRIPTIVE questions that feed the "Best for someone who wants..." strip
// (see lib/pollBestFor.ts). Two of these (freedom_time_choices, comfort_zone) currently
// exist as EVALUATIVE in the live DB -- reclassified to DESCRIPTIVE here since a
// scored/graded ring is the wrong shape for a neutral fit dimension.
const BEST_FOR_PHRASES: {
  key: string;
  lowPhrase: string;
  highPhrase: string;
  scaleType?: "DESCRIPTIVE";
}[] = [
  {
    key: "freedom_time_choices",
    lowPhrase: "clear structure and a set schedule",
    highPhrase: "a lot of free time and autonomy",
    scaleType: "DESCRIPTIVE",
  },
  {
    key: "adult_vs_student",
    lowPhrase: "guidance and close supervision",
    highPhrase: "being treated like an adult",
  },
  {
    key: "hebrew_vs_english",
    lowPhrase: "an English-friendly landing",
    highPhrase: "full Hebrew immersion",
  },
  {
    key: "hebrew_feeling_lost",
    lowPhrase: "starting from zero Hebrew",
    highPhrase: "already having Hebrew to build on",
  },
  {
    key: "torah_knowledge",
    lowPhrase: "no learning background required",
    highPhrase: "serious prior learning to build on",
  },
  {
    key: "free_time",
    lowPhrase: "a full, intensive learning schedule",
    highPhrase: "learning plus room to breathe",
  },
  {
    key: "comfort_zone",
    lowPhrase: "a manageable, steady pace",
    highPhrase: "being pushed hard",
    scaleType: "DESCRIPTIVE",
  },
];

async function main() {
  let updated = 0;
  let missing = 0;
  for (const q of BEST_FOR_PHRASES) {
    const existing = await prisma.pollQuestion.findUnique({ where: { key: q.key } });
    if (!existing) {
      console.log(`SKIP: no PollQuestion with key "${q.key}" exists.`);
      missing++;
      continue;
    }
    await prisma.pollQuestion.update({
      where: { key: q.key },
      data: {
        lowPhrase: q.lowPhrase,
        highPhrase: q.highPhrase,
        ...(q.scaleType ? { scaleType: q.scaleType } : {}),
      },
    });
    console.log(`Updated ${q.key}${q.scaleType ? ` (scaleType -> ${q.scaleType})` : ""}.`);
    updated++;
  }
  console.log(`\nDone: ${updated} updated, ${missing} missing.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
