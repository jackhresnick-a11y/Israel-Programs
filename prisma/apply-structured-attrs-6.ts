import { PrismaClient, TravelType } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// One-off structured-attribute pass for batch 6 (researched-programs-6.json).
// import-researched.ts only populates raw fields; hasScholarship/
// hasCollegeCredit/travelType are set here from the same research notes,
// same as a human editor would via the admin form. See CLAUDE.md's
// "Adding real programs" section.
const HAS_COLLEGE_CREDIT: string[] = [
  "s-daniel-abraham-israel-program",
  "tichon-ramah-yerushalayim-try",
  "darchei-binah",
  "urj-heller-high",
  "neveh-zion",
];

const HAS_SCHOLARSHIP: string[] = [
  "tichon-ramah-yerushalayim-try",
  "new-israel-fund-shatil-social-justice-fellowship",
  "israel-tech-challenge-fellows-program",
  "israel-free-spirit",
];

const TRAVEL: Record<string, "SINGLE_LOCATION" | "MULTI_CITY_TOURING"> = {
  "habonim-dror-southern-africa-shnat": "MULTI_CITY_TOURING",
  "shnat-netzer": "MULTI_CITY_TOURING",
  "darchei-binah": "MULTI_CITY_TOURING",
  otzma: "MULTI_CITY_TOURING",
  "israel-free-spirit": "MULTI_CITY_TOURING",
  "yad-byad": "MULTI_CITY_TOURING",
  "kibbutz-program-center-kpc": "SINGLE_LOCATION",
  "tel-shimron-excavations": "SINGLE_LOCATION",
};

async function main() {
  for (const slug of HAS_COLLEGE_CREDIT) {
    const res = await prisma.program.updateMany({ where: { slug }, data: { hasCollegeCredit: true } });
    console.log(`hasCollegeCredit=true: ${slug} -> ${res.count} row(s)`);
  }
  for (const slug of HAS_SCHOLARSHIP) {
    const res = await prisma.program.updateMany({ where: { slug }, data: { hasScholarship: true } });
    console.log(`hasScholarship=true: ${slug} -> ${res.count} row(s)`);
  }
  for (const [slug, value] of Object.entries(TRAVEL)) {
    const res = await prisma.program.updateMany({
      where: { slug },
      data: { travelType: value as TravelType },
    });
    console.log(`travelType=${value}: ${slug} -> ${res.count} row(s)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
