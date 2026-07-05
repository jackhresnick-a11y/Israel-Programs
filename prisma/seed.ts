import { PrismaClient, DurationType } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const SEED_USER_ID = "seed-admin";

async function upsertTags(names: string[]) {
  const tags = [];
  for (const name of names) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    tags.push(
      await prisma.tag.upsert({
        where: { slug },
        update: {},
        create: { name, slug },
      })
    );
  }
  return tags;
}

async function main() {
  const programs = [
    {
      name: "Birthright Israel",
      slug: "birthright-israel",
      description:
        "A free 10-day trip to Israel for young Jewish adults ages 18-32, covering history, culture, and modern life across the country.",
      organization: "Taglit-Birthright Israel",
      location: "Multiple cities (Jerusalem, Tel Aviv, Golan Heights, Negev)",
      durationType: DurationType.TEN_DAY,
      durationText: "10 days",
      cost: "Free (flights, lodging, and most meals included)",
      signupInstructions: "Apply online through an approved trip provider once eligibility is confirmed.",
      signupUrl: "https://www.birthrightisrael.com",
      contactEmail: "info@birthrightisrael.com",
      tags: ["free", "10-day", "young-adults", "history", "culture"],
    },
    {
      name: "Onward Israel",
      slug: "onward-israel",
      description:
        "A summer or semester internship and academic program in Israel for young adults, combining professional experience with Israel exploration.",
      organization: "Onward Israel",
      location: "Tel Aviv, Haifa, Jerusalem",
      durationType: DurationType.SUMMER,
      durationText: "6-10 weeks",
      cost: "Program fee varies; scholarships available",
      signupInstructions: "Apply online, select an internship track, and complete an interview.",
      signupUrl: "https://onwardisrael.org",
      contactEmail: "info@onwardisrael.org",
      tags: ["internship", "summer", "career", "academic"],
    },
    {
      name: "Young Judaea Year Course",
      slug: "young-judaea-year-course",
      description:
        "A nine-month gap year program combining volunteering, touring, army experience, and academic study across Israel.",
      organization: "Young Judaea",
      location: "Bat Yam, with travel nationwide",
      durationType: DurationType.GAP_YEAR,
      durationText: "9 months",
      cost: "~$30,000 (financial aid available)",
      signupInstructions: "Submit an online application and complete an admissions interview.",
      signupUrl: "https://yearcourse.org",
      contactEmail: "admissions@youngjudaea.org",
      tags: ["gap-year", "volunteering", "army", "zionism"],
    },
    {
      name: "Nativ College Leadership Program",
      slug: "nativ",
      description:
        "A Conservative movement gap year program blending Israel study, army service (Marva), and leadership development.",
      organization: "United Synagogue Youth (USY)",
      location: "Jerusalem, with travel nationwide",
      durationType: DurationType.GAP_YEAR,
      durationText: "9-10 months",
      cost: "~$28,000 (financial aid available)",
      signupInstructions: "Apply online through the USY Nativ website.",
      signupUrl: "https://nativcollegeleadership.org",
      contactEmail: "nativ@uscj.org",
      tags: ["gap-year", "leadership", "army", "conservative-movement"],
    },
    {
      name: "Livnot U'Lehibanot",
      slug: "livnot",
      description:
        "Short-term programs in Tzfat and Jerusalem focused on Jewish identity, hiking, volunteering, and Israeli history.",
      organization: "Livnot U'Lehibanot",
      location: "Tzfat, Jerusalem",
      durationType: DurationType.SUMMER,
      durationText: "3-5 weeks",
      cost: "$1,500-$3,000 depending on session",
      signupInstructions: "Apply through the Livnot website; rolling admissions.",
      signupUrl: "https://livnot.org",
      contactEmail: "info@livnot.org",
      tags: ["short-term", "hiking", "identity", "volunteering"],
    },
  ];

  for (const p of programs) {
    const { tags: tagNames, ...data } = p;
    const tags = await upsertTags(tagNames);
    await prisma.program.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        ...data,
        status: "PUBLISHED",
        createdById: SEED_USER_ID,
        tags: { connect: tags.map((t) => ({ id: t.id })) },
        reviews: {
          create: [
            {
              rating: 5,
              text: `${p.name} completely changed how I see my connection to Israel. Highly recommend to anyone considering it.`,
              reviewerName: "Sample Alum",
            },
          ],
        },
      },
    });
  }

  console.log(`Seeded ${programs.length} programs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
