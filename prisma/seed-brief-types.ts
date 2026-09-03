import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// Placeholder prompt text -- replace via /admin/briefs/types before relying on either
// type for a real draft. Seeded here only so the two types exist with something
// non-empty in promptText (the column is NOT NULL).
const PLACEHOLDER_PROMPT =
  "TODO: replace this placeholder with the real prompt for this brief type, via /admin/briefs/types.";

const BRIEF_TYPES = [
  {
    name: "What it is",
    slug: "what-it-is",
    promptText: PLACEHOLDER_PROMPT,
    sendToAssistant: true,
    supersedesAiBrief: true,
    sortOrder: 0,
  },
  {
    name: "A day in the life",
    slug: "a-day-in-the-life",
    promptText: PLACEHOLDER_PROMPT,
    sendToAssistant: false,
    supersedesAiBrief: false,
    sortOrder: 1,
  },
];

async function main() {
  for (const type of BRIEF_TYPES) {
    const existing = await prisma.briefType.findUnique({ where: { slug: type.slug } });
    if (existing) {
      console.log(`BriefType '${type.slug}' already exists -- leaving it as is (not overwriting an edit).`);
      continue;
    }
    await prisma.briefType.create({ data: { ...type, active: true } });
    console.log(`Seeded BriefType '${type.slug}'.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
