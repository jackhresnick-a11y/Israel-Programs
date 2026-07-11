import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import slugify from "slugify";
import { PrismaClient, DurationType } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { recordProgramForExport } from "@/lib/programExport";
import { resolveTagsByName } from "@/lib/tags";
import { assertNoImportedContactFields } from "@/lib/importGuards";

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
  contactPhone: string;
  contactWebsite: string;
  tags: string[];
};

/** A batch row may still carry a raw contactEmail from research -- captured below to a
 * review file for the contact-verification workflow, never written to Program.contactEmail
 * (see lib/importGuards.ts). Not part of ResearchedProgram since import code must never
 * treat it as a real Program field. __batchCategory records which top-level category key
 * of the batch JSON a row came from, for context in the captured file. */
type RawImportRow = ResearchedProgram & { contactEmail?: string; __batchCategory?: string };

function slugFor(name: string): string {
  return slugify(name, { lower: true, strict: true });
}

async function main() {
  const fileName = process.argv[2] || "researched-programs.json";
  const jsonPath = join(__dirname, "..", "data", fileName);
  const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;

  const categories = Object.keys(raw).filter((k) => k !== "_note");
  const all: RawImportRow[] = categories.flatMap((key) =>
    (raw[key] as RawImportRow[]).map((p) => ({ ...p, __batchCategory: key }))
  );

  // Dedupe by slug, keeping the first occurrence when a program appears in
  // multiple category batches (e.g. hesder yeshivot researched twice).
  const seenSlugs = new Set<string>();
  const deduped: RawImportRow[] = [];
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
  let newTagsMinted = 0;

  // Batch rows carrying a raw contactEmail never get it written to Program (see
  // lib/importGuards.ts) -- captured here instead so the research finding isn't lost,
  // regardless of whether the row ends up created or skipped as a duplicate/existing.
  const ignoredEmails: {
    slug: string;
    name: string;
    contactEmail: string;
    category: string;
    signupUrl?: string;
    contactWebsite?: string;
  }[] = [];

  // Snapshot of existing tags, mirroring lib/tags.ts's matchTag rule (case-insensitive
  // name, then slug fallback) -- used only to detect and log when this batch is about
  // to mint a brand-new tag instead of reattaching a canonical one, since a freeform
  // research vocabulary re-creating "gap-year"-style duplicates under a slightly
  // different name is exactly how the categorized/legacy tag split happened before
  // (see prisma/merge-duplicate-tags.ts). Updated locally as tags are created so a name
  // repeated later in the same batch isn't flagged twice.
  const existingTagNames = new Set((await prisma.tag.findMany({ select: { name: true } })).map((t) => t.name.toLowerCase()));
  const existingTagSlugs = new Set((await prisma.tag.findMany({ select: { slug: true } })).map((t) => t.slug));

  for (const p of deduped) {
    const slug = slugFor(p.name);

    const rawEmail = p.contactEmail?.trim();
    if (rawEmail) {
      ignoredEmails.push({
        slug,
        name: p.name,
        contactEmail: rawEmail,
        category: p.__batchCategory ?? "unknown",
        signupUrl: p.signupUrl || undefined,
        contactWebsite: p.contactWebsite || undefined,
      });
    }

    const existing = await prisma.program.findUnique({ where: { slug } });
    if (existing) {
      skippedExisting++;
      continue;
    }

    const newTagNames = p.tags
      .map((t) => t.trim())
      .filter((name) => name && !existingTagNames.has(name.toLowerCase()) && !existingTagSlugs.has(slugFor(name)));
    if (newTagNames.length > 0) {
      console.warn(
        `  [new tag] "${p.name}" is minting ${newTagNames.length} brand-new tag(s) instead of reattaching an existing one: ${newTagNames.join(", ")} -- double check these aren't a differently-worded duplicate of an existing taxonomy tag.`
      );
      for (const name of newTagNames) {
        existingTagNames.add(name.toLowerCase());
        existingTagSlugs.add(slugFor(name));
      }
      newTagsMinted += newTagNames.length;
    }

    const tags = await resolveTagsByName(p.tags);
    const programData = {
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
      contactPhone: p.contactPhone || undefined,
      contactWebsite: p.contactWebsite || undefined,
      status: "PUBLISHED" as const,
      createdById: IMPORT_USER_ID,
      tags: { connect: tags },
    };
    assertNoImportedContactFields(programData);
    const program = await prisma.program.create({ data: programData });
    await recordProgramForExport(program.id, program.name);
    created++;
  }

  console.log(
    `Imported ${created} programs (${skippedDuplicateInBatch} duplicate slugs across research batches, ${skippedExisting} already in DB, ${newTagsMinted} brand-new tags minted -- see [new tag] warnings above for any worth double-checking).`
  );

  if (ignoredEmails.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const ignoredPath = join(__dirname, "..", "data", `ignored-import-emails-${today}.json`);
    writeFileSync(ignoredPath, JSON.stringify(ignoredEmails, null, 2));
    console.warn(
      `\n[ignored emails] ${ignoredEmails.length} batch row(s) carried a contactEmail that was NOT written to the Program -- see data/ignored-import-emails-${today}.json. Route these through the contact-verification workflow instead of program import.`
    );
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
