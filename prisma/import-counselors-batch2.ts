import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

type CounselorRow = {
  schoolName: string;
  country: string;
  cityRegion: string;
  contactName: string | null;
  email: string;
  emailIsGeneric: boolean;
  sourceUrl: string;
  notes: string | null;
};

async function main() {
  const fileName = process.argv[2] || "data-counselors-batch2.json";
  const jsonPath = join(__dirname, fileName);
  const rows = JSON.parse(readFileSync(jsonPath, "utf-8")) as CounselorRow[];

  let created = 0;
  let skippedExisting = 0;

  for (const row of rows) {
    const existing = await prisma.counselorContact.findUnique({
      where: { schoolName_country: { schoolName: row.schoolName, country: row.country } },
    });
    if (existing) {
      console.log(`  [skip existing] ${row.schoolName} (${row.country})`);
      skippedExisting++;
      continue;
    }

    await prisma.counselorContact.create({ data: row });
    console.log(`  [created] ${row.schoolName} (${row.country})`);
    created++;
  }

  console.log(`\nImported ${created} counselor contacts (${skippedExisting} already in DB, expected ${rows.length} total in batch).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
