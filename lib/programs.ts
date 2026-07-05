import slugify from "slugify";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DurationType, Prisma, ProgramStatus } from "@/app/generated/prisma/client";

export { DURATION_LABELS } from "@/lib/duration";

export type ProgramInput = {
  name: string;
  description: string;
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
  tags: string[];
  logoUrl?: string;
};

const programSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(5000),
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
  tags: z.string().optional().or(z.literal("")),
});

export function parseProgramFormData(formData: FormData): ProgramInput {
  const raw = Object.fromEntries(
    ["name", "description", "organization", "location", "durationType", "durationText", "cost", "signupInstructions", "signupUrl", "contactEmail", "contactPhone", "contactWebsite", "tags"].map(
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
  return prisma.program.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
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
      logoUrl: input.logoUrl,
      createdById,
      status,
      tags: { connect: tags },
    },
  });
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

export async function approveEdit(editId: string) {
  const edit = await prisma.programEdit.findUniqueOrThrow({ where: { id: editId } });
  const input = JSON.parse(edit.payload) as ProgramInput;
  await updateProgram(edit.programId, input);
  return prisma.programEdit.update({
    where: { id: editId },
    data: { status: "APPROVED", reviewedAt: new Date() },
  });
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
  tag?: string;
  duration?: DurationType;
};

export async function listPrograms(filters: ProgramFilters) {
  const where: Prisma.ProgramWhereInput = {
    status: "PUBLISHED",
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q } },
            { description: { contains: filters.q } },
            { organization: { contains: filters.q } },
          ],
        }
      : {}),
    ...(filters.tag ? { tags: { some: { slug: filters.tag } } } : {}),
    ...(filters.duration ? { durationType: filters.duration } : {}),
  };

  return prisma.program.findMany({
    where,
    include: { tags: true, reviews: true },
    orderBy: { createdAt: "desc" },
  });
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
