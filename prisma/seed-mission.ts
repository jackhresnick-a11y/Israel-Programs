import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const MISSION_TEXT = `Too many young Jews rule themselves out of coming to Israel before they even look — convinced that the only option is a hardcore yeshiva, learning all day, every day. That misconception keeps people away who would otherwise thrive here: the athlete, the artist, the volunteer, the future doctor, the person who wants adventure more than text study.

The truth is there's a program for almost everyone. Gap years built around hiking and volunteering. Semesters combining army service with academics. Internships, art programs, environmental work, medical tracks, short trips, long immersions — religious and secular, structured and independent, co-ed and single-gender.

This directory exists to make that truth impossible to miss. By gathering real information on the full range of programs available — not just the most visible or most heavily marketed ones — we want anyone considering a trip to Israel to be able to find something that actually fits who they are, not just what they assumed Israel had to offer.

If you've ever thought "Israel isn't for me" because you pictured only one kind of program: this is built to prove you wrong.`;

async function main() {
  const existing = await prisma.siteContent.findUnique({ where: { key: "mission" } });
  if (existing) {
    console.log("SiteContent 'mission' already exists -- leaving it as is (not overwriting an edit).");
    return;
  }
  await prisma.siteContent.create({ data: { key: "mission", body: MISSION_TEXT } });
  console.log("Seeded initial mission statement.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
