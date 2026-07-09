import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { MissionBlock } from "../lib/mission";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const BLOCKS: MissionBlock[] = [
  {
    icon: "compass",
    heading: "The problem",
    body: "Every year, **thousands of Jews set out to find a program in Israel** — a gap year, a summer trip, a semester abroad — and run straight into the same wall: information that's **scattered across dozens of websites, word-of-mouth, and outdated brochures**, with no reliable way to compare programs side by side or trust what's actually being said about them.",
  },
  {
    icon: "people",
    heading: "What this is",
    body: "This is a **living, community-built directory** — maintained not by a single organization with something to sell, but by **people who've actually done these programs**: alumni, current participants, and staff who volunteer their honest experience so the next person doesn't have to guess.",
  },
  {
    icon: "map-pin",
    heading: "The bigger vision",
    body: "A program is rarely just a program. It's a **community, a place, a path** — the people you'll live with, the city or yishuv you'll come to know, the direction it points you toward afterward. Our goal is to help you find not only the right program, but **your broader place in Israel**.",
  },
  {
    icon: "pencil",
    heading: "How you can help",
    body: "This directory only stays accurate because people like you keep it that way. **Add a review, suggest an edit, or list a program we're missing** — every contribution helps the next person make a more informed choice.",
  },
];

async function main() {
  const existing = await prisma.siteContent.findUnique({ where: { key: "missionBlocks" } });
  if (existing) {
    console.log("SiteContent 'missionBlocks' already exists -- leaving it as is (not overwriting an edit).");
    return;
  }
  await prisma.siteContent.create({
    data: { key: "missionBlocks", body: JSON.stringify(BLOCKS) },
  });
  console.log("Seeded initial Background page content blocks.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
