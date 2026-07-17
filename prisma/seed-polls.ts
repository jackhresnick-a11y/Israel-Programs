import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const CORE_QUESTIONS = [
  {
    key: "overall",
    text: "Overall, how was this program?",
    type: "STARS" as const,
    labels: ["Poor", "Fair", "Good", "Very good", "Excellent"],
  },
  {
    key: "recommend",
    text: "Would you recommend it to a friend?",
    type: "RADIO" as const,
    labels: ["Definitely not", "Probably not", "Maybe", "Probably", "Definitely"],
  },
  {
    key: "worth_cost",
    text: "Was it worth the cost?",
    type: "RADIO" as const,
    labels: ["Not at all", "Not really", "Somewhat", "Mostly", "Completely"],
  },
  {
    key: "staff",
    text: "How were the staff and leadership?",
    type: "RADIO" as const,
    labels: ["Poor", "Fair", "Good", "Very good", "Excellent"],
  },
  {
    key: "again",
    text: "Would you do it again?",
    type: "RADIO" as const,
    labels: ["Definitely not", "Probably not", "Maybe", "Probably", "Definitely"],
  },
];

async function main() {
  // Upsert with an empty `update` so a re-run never clobbers an admin's later edits to
  // text/labels -- same idempotency pattern as prisma/seed-duration-region.ts.
  const questionIds: string[] = [];
  for (const q of CORE_QUESTIONS) {
    const row = await prisma.pollQuestion.upsert({
      where: { key: q.key },
      update: {},
      create: { key: q.key, text: q.text, type: q.type, labels: q.labels },
    });
    questionIds.push(row.id);
  }
  console.log(`Seeded ${CORE_QUESTIONS.length} core PollQuestion rows (skipped any that already existed).`);

  const existingCore = await prisma.questionBucket.findFirst({ where: { isCore: true } });
  if (!existingCore) {
    await prisma.questionBucket.create({
      data: { name: "Core", questionIds, order: 0, isCore: true },
    });
    console.log("Created the Core QuestionBucket.");
  } else if (existingCore.questionIds.length === 0) {
    await prisma.questionBucket.update({
      where: { id: existingCore.id },
      data: { questionIds },
    });
    console.log("Core QuestionBucket already existed with no questions -- filled it in.");
  } else {
    console.log("Core QuestionBucket already existed with questions set -- left it untouched.");
  }

  const programs = await prisma.program.findMany({ select: { id: true } });
  const result = await prisma.programPollConfig.createMany({
    data: programs.map((p) => ({ programId: p.id })),
    skipDuplicates: true,
  });
  console.log(
    `ProgramPollConfig: ${programs.length} programs found, ${result.count} new config rows created ` +
      `(${programs.length - result.count} already had one).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
