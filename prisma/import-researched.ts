import { readFileSync } from "fs";
import { join } from "path";
import slugify from "slugify";
import { PrismaClient, DurationType } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { appendProgramNameToXlsx } from "@/lib/xlsxSync";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const IMPORT_USER_ID = "researched-import";

type ResearchedProgram = {
  name: string;
  organization: string;
  location: string;
  description: string;
  durationType: keyof typeof DurationType;
  durationText: string;
  cost: string;
  signupInstructions: string;
  signupUrl: string;
  contactEmail: string;
  contactPhone: string;
  contactWebsite: string;
  tags: string[];
};

function slugFor(name: string): string {
  return slugify(name, { lower: true, strict: true });
}

async function upsertTags(names: string[]) {
  const tags = [];
  for (const name of names) {
    const slug = slugify(name, { lower: true, strict: true });
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
  const fileName = process.argv[2] || "researched-programs.json";
  const jsonPath = join(__dirname, "..", "data", fileName);
  const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;

  const categories = Object.keys(raw).filter((k) => k !== "_note");
  const all: ResearchedProgram[] = categories.flatMap(
    (key) => raw[key] as ResearchedProgram[]
  );

  // Dedupe by slug, keeping the first occurrence when a program appears in
  // multiple category batches (e.g. hesder yeshivot researched twice).
  const seenSlugs = new Set<string>();
  const deduped: ResearchedProgram[] = [];
  let skippedDuplicateInBatch = 0;
  for (const p of all) {
    const slug = slugFor(p.name);
    if (seenSlugs.has(slug)) {
      skippedDuplicateInBatch++;
      continue;
    }
    seenSlugs.add(slug);
    deduped.push(p);
  }

  let created = 0;
  let skippedExisting = 0;

  for (const p of deduped) {
    const slug = slugFor(p.name);
    const existing = await prisma.program.findUnique({ where: { slug } });
    if (existing) {
      skippedExisting++;
      continue;
    }

    const tags = await upsertTags(p.tags);
    const program = await prisma.program.create({
      data: {
        name: p.name,
        slug,
        description: p.description,
        organization: p.organization || undefined,
        location: p.location || undefined,
        durationType: DurationType[p.durationType] ?? DurationType.CUSTOM,
        durationText: p.durationText || undefined,
        cost: p.cost || undefined,
        signupInstructions: p.signupInstructions || undefined,
        signupUrl: p.signupUrl || undefined,
        contactEmail: p.contactEmail || undefined,
        contactPhone: p.contactPhone || undefined,
        contactWebsite: p.contactWebsite || undefined,
        status: "PUBLISHED",
        createdById: IMPORT_USER_ID,
        tags: { connect: tags.map((t) => ({ id: t.id })) },
      },
    });
    await appendProgramNameToXlsx(program.id, program.name);
    created++;
  }

  console.log(
    `Imported ${created} programs (${skippedDuplicateInBatch} duplicate slugs across research batches, ${skippedExisting} already in DB).`
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
