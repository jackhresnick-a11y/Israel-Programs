import slugify from "slugify";
import { z } from "zod";
import Fuse from "fuse.js";
import { prisma } from "@/lib/prisma";
import { DurationType, Prisma, ProgramStatus, TravelType } from "@/app/generated/prisma/client";
import { recordProgramForExport } from "@/lib/programExport";

export { DURATION_LABELS } from "@/lib/duration";

export type ProgramInput = {
  name: string;
  description: string;
  goodFor?: string;
  organization?: string;
  location?: string;
  durationType: DurationType;
  durationText?: string;
  cost?: string;
  signupInstructions?: string;
  signupUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactWebsite?: string;
  hasScholarship?: boolean;
  hasCollegeCredit?: boolean;
  travelType?: TravelType;
  tags: string[];
  logoUrl?: string;
};

const programSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(5000),
  goodFor: z.string().trim().max(2000).optional().or(z.literal("")),
  organization: z.string().trim().max(200).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  durationType: z.enum(DurationType),
  durationText: z.string().trim().max(200).optional().or(z.literal("")),
  cost: z.string().trim().max(200).optional().or(z.literal("")),
  signupInstructions: z.string().trim().max(2000).optional().or(z.literal("")),
  signupUrl: z.string().trim().url().optional().or(z.literal("")),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  contactPhone: z.string().trim().max(50).optional().or(z.literal("")),
  contactWebsite: z.string().trim().url().optional().or(z.literal("")),
  hasScholarship: z.string().optional().transform((v) => v === "true"),
  hasCollegeCredit: z.string().optional().transform((v) => v === "true"),
  travelType: z
    .string()
    .optional()
    .transform((v) => (v === "SINGLE_LOCATION" || v === "MULTI_CITY_TOURING" ? v : undefined)),
  tags: z.string().optional().or(z.literal("")),
});

export function parseProgramFormData(formData: FormData): ProgramInput {
  const raw = Object.fromEntries(
    ["name", "description", "goodFor", "organization", "location", "durationType", "durationText", "cost", "signupInstructions", "signupUrl", "contactEmail", "contactPhone", "contactWebsite", "hasScholarship", "hasCollegeCredit", "travelType", "tags"].map(
      (key) => [key, formData.get(key)?.toString() ?? ""]
    )
  );

  const parsed = programSchema.parse(raw);

  return {
    ...parsed,
    tags: parseTags(parsed.tags ?? ""),
  };
}

export function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,#]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

async function tagConnections(tagNames: string[]) {
  return Promise.all(
    tagNames.map(async (name) => {
      const slug = slugify(name, { lower: true, strict: true });
      const tag = await prisma.tag.upsert({
        where: { slug },
        update: {},
        create: { name, slug },
      });
      return { id: tag.id };
    })
  );
}

export async function createProgram(
  input: ProgramInput,
  createdById: string,
  status: ProgramStatus
) {
  const slug = await uniqueSlug(input.name);
  const tags = await tagConnections(input.tags);
  const program = await prisma.program.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
      goodFor: input.goodFor,
      organization: input.organization,
      location: input.location,
      durationType: input.durationType,
      durationText: input.durationText,
      cost: input.cost,
      signupInstructions: input.signupInstructions,
      signupUrl: input.signupUrl,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      contactWebsite: input.contactWebsite,
      hasScholarship: input.hasScholarship,
      hasCollegeCredit: input.hasCollegeCredit,
      travelType: input.travelType,
      logoUrl: input.logoUrl,
      createdById,
      status,
      tags: { connect: tags },
    },
  });
  // Best-effort: never lets an export-log hiccup break program creation.
  // The startup reconciliation sweep (instrumentation.ts) catches anything
  // this misses.
  void recordProgramForExport(program.id, program.name);
  return program;
}

/** Queues a proposed edit for moderator review instead of applying it immediately. */
export async function createProgramEdit(
  programId: string,
  input: ProgramInput,
  submittedById: string
) {
  return prisma.programEdit.create({
    data: {
      programId,
      submittedById,
      payload: JSON.stringify(input),
    },
  });
}

export async function listPendingPrograms() {
  return prisma.program.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
}

export async function listPendingEdits() {
  return prisma.programEdit.findMany({
    where: { status: "PENDING" },
    include: { program: { include: { tags: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function approveProgram(id: string) {
  return prisma.program.update({ where: { id }, data: { status: "PUBLISHED" } });
}

export async function rejectProgram(id: string) {
  return prisma.program.update({ where: { id }, data: { status: "REJECTED" } });
}

export async function rejectEdit(editId: string) {
  return prisma.programEdit.update({
    where: { id: editId },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });
}

export async function updateProgram(id: string, input: ProgramInput) {
  const tags = await tagConnections(input.tags);
  return prisma.program.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      goodFor: input.goodFor,
      organization: input.organization,
      location: input.location,
      durationType: input.durationType,
      durationText: input.durationText,
      cost: input.cost,
      signupInstructions: input.signupInstructions,
      signupUrl: input.signupUrl,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      contactWebsite: input.contactWebsite,
      hasScholarship: input.hasScholarship,
      hasCollegeCredit: input.hasCollegeCredit,
      travelType: input.travelType,
      ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
      tags: { set: [], connect: tags },
    },
  });
}

async function uniqueSlug(name: string) {
  const base = slugify(name, { lower: true, strict: true });
  let slug = base;
  let i = 1;
  while (await prisma.program.findUnique({ where: { slug } })) {
    slug = `${base}-${++i}`;
  }
  return slug;
}

export type ProgramFilters = {
  q?: string;
  tags?: string[];
  duration?: DurationType;
  hasScholarship?: boolean;
  hasCollegeCredit?: boolean;
  travelType?: TravelType;
};

/**
 * Groups selected tag slugs by category and returns one AND-clause per
 * category, each an OR across that category's selected slugs -- e.g.
 * selecting two "location" tags matches either; selecting one "location" tag
 * and one uncategorized tag requires both. Tags with no category (the
 * general ~140-tag pool) all share one bucket, so multiple general tags OR
 * together too.
 */
async function buildTagAndClauses(slugs: string[]): Promise<Prisma.ProgramWhereInput[]> {
  if (slugs.length === 0) return [];

  const rows = await prisma.tag.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, category: true },
  });

  const byCategory = new Map<string, string[]>();
  for (const row of rows) {
    const key = row.category ?? "__general__";
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(row.slug);
    else byCategory.set(key, [row.slug]);
  }

  return Array.from(byCategory.values()).map((categorySlugs) => ({
    tags: { some: { slug: { in: categorySlugs } } },
  }));
}

// Weighted fuzzy-search keys for the free-text `q` box. Name/org/tags rank
// highest since a match there is almost always what the user meant; location
// and goodFor/description are searched too (unlike the old exact-substring
// query, which skipped them) but weighted low so a stray match deep in a
// long description doesn't outrank a real name/tag hit.
const SEARCH_KEYS: { name: string; weight: number }[] = [
  { name: "name", weight: 3 },
  { name: "organization", weight: 2 },
  { name: "tags.name", weight: 2 },
  { name: "tags.slug", weight: 2 },
  { name: "location", weight: 1 },
  { name: "goodFor", weight: 1 },
  { name: "description", weight: 1 },
];

export async function listPrograms(filters: ProgramFilters) {
  // Users are invited to type "#hashtag" into the same box, so strip a
  // leading "#" -- Fuse fuzzily matches the term against tag name/slug
  // directly, so no separate slugify-and-compare pass is needed.
  const term = filters.q?.trim().replace(/^#/, "").trim();

  const tagAndClauses = await buildTagAndClauses(filters.tags ?? []);

  const where: Prisma.ProgramWhereInput = {
    status: "PUBLISHED",
    ...(tagAndClauses.length > 0 ? { AND: tagAndClauses } : {}),
    ...(filters.duration ? { durationType: filters.duration } : {}),
    ...(filters.hasScholarship ? { hasScholarship: true } : {}),
    ...(filters.hasCollegeCredit ? { hasCollegeCredit: true } : {}),
    ...(filters.travelType ? { travelType: filters.travelType } : {}),
  };

  const programs = await prisma.program.findMany({
    where,
    include: { tags: true, reviews: true },
    orderBy: { createdAt: "desc" },
  });

  if (!term) return programs;

  // Structured filters (status/tags/duration/etc.) run in Postgres above;
  // the free-text term is fuzzy-ranked here in memory. At ~183 published
  // programs this is effectively free and avoids a pg_trgm migration +
  // raw SQL for a dataset this size -- see the fuzzy-search plan.
  const fuse = new Fuse(programs, {
    keys: SEARCH_KEYS,
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  return fuse.search(term).map((result) => result.item);
}

export async function getProgramBySlug(slug: string) {
  return prisma.program.findUnique({
    where: { slug },
    include: {
      tags: true,
      videos: { orderBy: { createdAt: "desc" } },
      reviews: { orderBy: { createdAt: "desc" } },
    },
  });
}

export function averageRating(reviews: { rating: number }[]) {
  if (reviews.length === 0) return null;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

export async function listAllTags() {
  return prisma.tag.findMany({ orderBy: { name: "asc" } });
}

/** Fetches published programs by slug, preserving the input order. */
export async function getProgramsBySlugs(slugs: string[]) {
  if (slugs.length === 0) return [];
  const programs = await prisma.program.findMany({
    where: { slug: { in: slugs }, status: "PUBLISHED" },
    include: { tags: true, reviews: true },
  });
  const bySlug = new Map(programs.map((p) => [p.slug, p]));
  return slugs.map((s) => bySlug.get(s)).filter((p): p is NonNullable<typeof p> => Boolean(p));
}

export async function listPublishedProgramNames() {
  return prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
}
