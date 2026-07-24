import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// Unipolar (highPhrase only) -- a low mean on these describes a weak outcome, which the
// strip must never surface. See the approved plan's classification tables.
const UNIPOLAR: { key: string; tier: "DEFINING" | "SIGNIFICANT"; highPhrase: string }[] = [
  { key: "staying_israel", tier: "DEFINING", highPhrase: "to come away wanting to build a life in Israel" },
  { key: "hebrew_sticking", tier: "DEFINING", highPhrase: "Hebrew that actually sticks" },
  { key: "army_prep", tier: "DEFINING", highPhrase: "serious preparation for the army" },
  { key: "unit_assignments", tier: "DEFINING", highPhrase: "a track toward elite and combat units" },
  { key: "social_circle", tier: "DEFINING", highPhrase: "a real Israeli social circle" },
  { key: "career_connected", tier: "DEFINING", highPhrase: "work that opens a real career path" },
  { key: "hebrew_ulpan", tier: "SIGNIFICANT", highPhrase: "strong daily Hebrew-learning support" },
];

// Bidirectional (both ends) -- a real either-way preference, not a strength/weakness.
const BIDIRECTIONAL: { key: string; tier: "DEFINING" | "SIGNIFICANT"; lowPhrase: string; highPhrase: string }[] = [
  { key: "hebrew_vs_english", tier: "DEFINING", lowPhrase: "an English-friendly landing", highPhrase: "full Hebrew immersion" },
  { key: "torah_knowledge", tier: "DEFINING", lowPhrase: "no prior learning background needed", highPhrase: "to build on serious prior learning" },
  { key: "freedom_time_choices", tier: "SIGNIFICANT", lowPhrase: "clear structure and a set schedule", highPhrase: "a lot of free time and autonomy" },
  { key: "adult_vs_student", tier: "SIGNIFICANT", lowPhrase: "close guidance and support", highPhrase: "to be treated like an adult" },
  { key: "comfort_zone", tier: "SIGNIFICANT", lowPhrase: "a manageable, steady pace", highPhrase: "to be pushed hard" },
  { key: "free_time", tier: "SIGNIFICANT", lowPhrase: "a full, intensive schedule", highPhrase: "learning with room to breathe" },
  { key: "hebrew_feeling_lost", tier: "SIGNIFICANT", lowPhrase: "to start from zero Hebrew", highPhrase: "to build on Hebrew they already have" },
];

// Never surface: aggregate-quality questions, or ones that feed a different UI element
// (staff_dependent feeds the variance note, not the strip).
const EXCLUDED_KEYS = ["overall", "recommend", "advertising", "staff_dependent"];

async function main() {
  let updated = 0;
  let missing = 0;

  for (const q of UNIPOLAR) {
    const existing = await prisma.pollQuestion.findUnique({ where: { key: q.key } });
    if (!existing) {
      console.log(`SKIP: no PollQuestion with key "${q.key}" exists.`);
      missing++;
      continue;
    }
    await prisma.pollQuestion.update({
      where: { key: q.key },
      data: { tier: q.tier, lowPhrase: null, highPhrase: q.highPhrase },
    });
    console.log(`Updated ${q.key} (unipolar, tier=${q.tier}).`);
    updated++;
  }

  for (const q of BIDIRECTIONAL) {
    const existing = await prisma.pollQuestion.findUnique({ where: { key: q.key } });
    if (!existing) {
      console.log(`SKIP: no PollQuestion with key "${q.key}" exists.`);
      missing++;
      continue;
    }
    await prisma.pollQuestion.update({
      where: { key: q.key },
      data: { tier: q.tier, lowPhrase: q.lowPhrase, highPhrase: q.highPhrase },
    });
    console.log(`Updated ${q.key} (bidirectional, tier=${q.tier}).`);
    updated++;
  }

  for (const key of EXCLUDED_KEYS) {
    const existing = await prisma.pollQuestion.findUnique({ where: { key } });
    if (!existing) {
      console.log(`SKIP: no PollQuestion with key "${key}" exists.`);
      missing++;
      continue;
    }
    await prisma.pollQuestion.update({ where: { key }, data: { tier: "EXCLUDED" } });
    console.log(`Updated ${key} (tier=EXCLUDED).`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${missing} missing. Every other question keeps its default CONTEXTUAL tier.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
