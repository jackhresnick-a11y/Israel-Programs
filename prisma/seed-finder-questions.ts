/**
 * One-time seed for the /find narrowing flow's four starter questions. Idempotent
 * upsert-by-key, same pattern as prisma/seed-tag-categories.ts -- safe to re-run.
 *
 * Every tagSlugs/durationValues value here is drawn from the live Tag table / the
 * DurationType enum as of 2026-08-09 (verified against production, NOT against the
 * other prisma/seed-*.ts files -- seed-new-taxonomy-tags.ts and
 * seed-army-training-tag.ts reference slugs, integration-none and
 * essence-army-training, that were never actually created). "No Israeli integration"
 * is deliberately not offered as a question 3 option -- zero published programs carry
 * `no-israeli-integration`, so offering it would dead-end every user who picked it.
 *
 * Run once:
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/seed-finder-questions.ts
 */
import { prisma } from "../lib/prisma";

type OptionSeed = {
  label: string;
  helpText?: string;
  order: number;
  tagSlugs?: string[];
  durationValues?: string[];
};

type QuestionSeed = {
  key: string;
  prompt: string;
  helpText?: string;
  order: number;
  options: OptionSeed[];
};

const QUESTIONS: QuestionSeed[] = [
  {
    key: "duration",
    prompt: "How long do you want to be in Israel?",
    order: 0,
    options: [
      { label: "A few weeks or less", order: 0, durationValues: ["TEN_DAY", "SHORT"] },
      { label: "A summer", order: 1, durationValues: ["SUMMER"] },
      { label: "A semester", order: 2, durationValues: ["SEMESTER"] },
      { label: "A full gap year", order: 3, durationValues: ["GAP_YEAR"] },
      { label: "A year or more", order: 4, durationValues: ["MULTI_YEAR", "ONGOING"] },
    ],
  },
  {
    key: "essence",
    prompt: "What do you want the program to be built around?",
    order: 1,
    options: [
      { label: "Spiritual growth", order: 0, tagSlugs: ["essence-spiritual-growth"] },
      { label: "Academic work or an internship", order: 1, tagSlugs: ["essence-academic-internship"] },
      { label: "Travel", order: 2, tagSlugs: ["essence-travel"] },
    ],
  },
  {
    key: "integration",
    prompt: "Do you want to be around Israelis, or mostly other English speakers?",
    order: 2,
    options: [
      { label: "Mostly Israelis", order: 0, tagSlugs: ["integration-high"] },
      { label: "A mix", order: 1, tagSlugs: ["integration-medium"] },
      { label: "Mostly English speakers", order: 2, tagSlugs: ["integration-low"] },
    ],
  },
  {
    key: "army",
    prompt: "Interested in pre-military programs?",
    order: 3,
    options: [
      { label: "Yes, include pre-military programs", order: 0, tagSlugs: ["essence-pre-military"] },
      { label: "No preference", order: 1 },
    ],
  },
];

async function main() {
  for (const question of QUESTIONS) {
    const row = await prisma.finderQuestion.upsert({
      where: { key: question.key },
      update: { prompt: question.prompt, helpText: question.helpText ?? null, order: question.order },
      create: {
        key: question.key,
        prompt: question.prompt,
        helpText: question.helpText ?? null,
        order: question.order,
      },
    });
    console.log(`upserted question ${row.key}`);

    const existingOptions = await prisma.finderOption.findMany({ where: { questionId: row.id } });
    for (const option of question.options) {
      const existing = existingOptions.find((o) => o.label === option.label);
      if (existing) {
        await prisma.finderOption.update({
          where: { id: existing.id },
          data: {
            helpText: option.helpText ?? null,
            order: option.order,
            tagSlugs: option.tagSlugs ?? [],
            durationValues: option.durationValues ?? [],
          },
        });
      } else {
        await prisma.finderOption.create({
          data: {
            questionId: row.id,
            label: option.label,
            helpText: option.helpText ?? null,
            order: option.order,
            tagSlugs: option.tagSlugs ?? [],
            durationValues: option.durationValues ?? [],
          },
        });
      }
      console.log(`  upserted option "${option.label}"`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
