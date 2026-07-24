import slugify from "slugify";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  DurationType,
  EmailVerificationStatus,
  Prisma,
  ProgramStatus,
  TravelType,
  WebsiteLanguage,
} from "@/app/generated/prisma/client";
import { recordProgramForExport } from "@/lib/programExport";
import { resolveTagsByName, resolveExistingTagsByName } from "@/lib/tags";
import { rankBySearchTerm } from "@/lib/programSearch";

export { DURATION_LABELS } from "@/lib/duration";

/** zod's .url() accepts any scheme (javascript:, data:, ...); this restricts to http/https
 *  so a submitted link can never execute script or render as an inline resource when clicked. */
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), { message: "Must be a valid http(s) URL" });

export type ProgramInput = {
  name: string;
  nameHe?: string;
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
  nameHe: z.string().trim().max(200).optional().or(z.literal("")),
  description: z.string().trim().min(1, "Description is required").max(5000),
  goodFor: z.string().trim().max(2000).optional().or(z.literal("")),
  organization: z.string().trim().max(200).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  durationType: z.enum(DurationType),
  durationText: z.string().trim().max(200).optional().or(z.literal("")),
  cost: z.string().trim().max(200).optional().or(z.literal("")),
  signupInstructions: z.string().trim().max(2000).optional().or(z.literal("")),
  signupUrl: httpUrl.optional().or(z.literal("")),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  contactPhone: z.string().trim().max(50).optional().or(z.literal("")),
  contactWebsite: httpUrl.optional().or(z.literal("")),
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
    ["name", "nameHe", "description", "goodFor", "organization", "location", "durationType", "durationText", "cost", "signupInstructions", "signupUrl", "contactEmail", "contactPhone", "contactWebsite", "hasScholarship", "hasCollegeCredit", "travelType", "tags"].map(
      (key) => [key, formData.get(key)?.toString() ?? ""]
    )
  );

  const parsed = programSchema.parse(raw);

  return {
    ...parsed,
    tags: parseTags(parsed.tags ?? ""),
  };
}

/** Splits/dedupes the comma-or-hashtag-separated tag box into display names,
 * case-insensitively but preserving each name's typed casing (the first occurrence
 * wins) -- lowercasing here used to be what fed slugify(name) in tagConnections/
 * resolveTagsByName, and for a tag whose canonical slug isn't slugify(its own name)
 * (see lib/tags.ts's matchTag) that's irrelevant to matching, but the original casing
 * is still what a newly-created tag's Tag.name ends up as. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,#]/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/** Admin-only fields that must never reach the public JSON API -- strip these at every
 *  response boundary that isn't gated to a moderator/admin. Server Components render
 *  adminNote themselves behind an {isModerator && ...} check, so they call listPrograms/
 *  getProgramBySlug directly and don't go through this; only the public GET routes do. */
const ADMIN_ONLY_PROGRAM_FIELDS = ["adminNote", "contactEmailSource", "outreachCategory"] as const;

export function toPublicProgram<T extends Record<string, unknown>>(
  program: T
): Omit<T, (typeof ADMIN_ONLY_PROGRAM_FIELDS)[number]> {
  const result = { ...program };
  for (const field of ADMIN_ONLY_PROGRAM_FIELDS) delete result[field];
  return result;
}

/** Plain-text share/OG description: strips the `**bold**` markers FormattedText
 *  renders, collapses whitespace, and truncates at a word boundary (~160 chars). */
export function shareDescription(text: string, maxLength = 160): string {
  const plain = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (plain.length <= maxLength) return plain;
  const cut = plain.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : maxLength).trimEnd()}…`;
}

/** Minimal fields for the per-program OG image route -- avoids pulling
 *  tags/videos/reviews for a request that only ever renders a name/subtitle. */
export async function getProgramShareData(slug: string) {
  return prisma.program.findUnique({
    where: { slug },
    select: { name: true, status: true, location: true, organization: true },
  });
}

export async function createProgram(
  input: ProgramInput,
  createdById: string,
  status: ProgramStatus,
  // Moderators/admins (and import scripts, via the default) can mint a brand-new public
  // Tag live, same as always. An ordinary submitter cannot -- their submission only
  // connects tags that already exist; any typed name matching nothing is queued as a
  // PendingTag row below instead of resolveTagsByName creating it immediately, since the
  // Tag itself would otherwise go live before a moderator ever sees the still-PENDING
  // program. See lib/tags.ts's resolveExistingTagsByName.
  { canCreateTags = true }: { canCreateTags?: boolean } = {}
) {
  const slug = await uniqueSlug(input.name);
  const { matched, unknown } = canCreateTags
    ? { matched: await resolveTagsByName(input.tags), unknown: [] as string[] }
    : await resolveExistingTagsByName(input.tags);

  const program = await prisma.program.create({
    data: {
      name: input.name,
      nameHe: input.nameHe || null,
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
      tags: { connect: matched },
    },
  });

  if (unknown.length > 0) {
    await prisma.pendingTag.createMany({
      data: unknown.map((name) => ({ programId: program.id, name, submittedById: createdById })),
    });
  }

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

/** Newest programs of any status, for the admin recent-activity feed. */
export async function listRecentPrograms(limit = 8) {
  return prisma.program.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, name: true, slug: true, status: true, createdAt: true },
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
  const [tags, existing] = await Promise.all([
    resolveTagsByName(input.tags),
    prisma.program.findUniqueOrThrow({ where: { id }, select: { contactEmail: true } }),
  ]);
  // A changed contactEmail is unverified by definition -- drop any prior
  // verification status/timestamp so the address re-enters the queue.
  const emailChanged = (existing.contactEmail ?? "") !== (input.contactEmail ?? "");

  return prisma.program.update({
    where: { id },
    data: {
      name: input.name,
      nameHe: input.nameHe || null,
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
      ...(emailChanged ? { contactEmailStatus: null, contactEmailVerifiedAt: null } : {}),
      tags: { set: [], connect: tags },
    },
  });
}

/** Tags-only update for admin surfaces that shouldn't have to round-trip the full
 * ProgramInput (e.g. /admin/programs' inline tag editor) -- same resolve-by-name +
 * clear-then-reconnect shape as updateProgram's tags handling, factored out rather than
 * requiring a full-form submit just to add or remove one tag. Always routes through
 * resolveTagsByName (never a bare slugify-and-upsert) per this codebase's tag-provenance
 * rule -- an admin caller creates a real Tag row for a genuinely new name, same as the
 * full program form does today. */
export async function updateProgramTags(id: string, names: string[]) {
  const tags = await resolveTagsByName(names);
  return prisma.program.update({
    where: { id },
    data: { tags: { set: [], connect: tags } },
    select: { id: true, tags: { select: { id: true, slug: true, name: true } } },
  });
}

/** Nulls out a program's logo, bypassing updateProgram's truthy-only guard
 * (`...(input.logoUrl ? { logoUrl: input.logoUrl } : {})`), which can set a
 * logo but never clear one. Returns the prior value so the caller can clean
 * up the orphaned Blob object. */
export async function clearProgramLogo(id: string): Promise<string | null> {
  const before = await prisma.program.findUniqueOrThrow({ where: { id }, select: { logoUrl: true } });
  await prisma.program.update({ where: { id }, data: { logoUrl: null } });
  return before.logoUrl;
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
  duration?: DurationType[];
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

export async function listPrograms(filters: ProgramFilters) {
  // Users are invited to type "#hashtag" into the same box, so strip a
  // leading "#" -- Fuse fuzzily matches the term against tag name/slug
  // directly, so no separate slugify-and-compare pass is needed.
  const term = filters.q?.trim().replace(/^#/, "").trim();

  const tagAndClauses = await buildTagAndClauses(filters.tags ?? []);

  const where: Prisma.ProgramWhereInput = {
    status: "PUBLISHED",
    ...(tagAndClauses.length > 0 ? { AND: tagAndClauses } : {}),
    ...(filters.duration && filters.duration.length > 0
      ? { durationType: { in: filters.duration } }
      : {}),
    ...(filters.hasScholarship ? { hasScholarship: true } : {}),
    ...(filters.hasCollegeCredit ? { hasCollegeCredit: true } : {}),
    ...(filters.travelType ? { travelType: filters.travelType } : {}),
  };

  const programs = await prisma.program.findMany({
    where,
    include: { tags: true, reviews: { where: { status: "PUBLISHED" } } },
    orderBy: { createdAt: "desc" },
  });

  if (!term) return programs;

  return rankBySearchTerm(programs, term);
}

export type FacetProgram = { id: string; durationType: DurationType; tagSlugs: string[] };

/** Every PUBLISHED program reduced to just id/duration/tag-slugs, optionally narrowed to
 * the same q-term candidate set listPrograms uses -- feeds lib/facetCounts.ts's
 * leave-one-out math for the browse page's dropdown option counts and empty-state
 * suggestions. Deliberately returns the FULL matching universe (not narrowed by the
 * current tag/duration selections) since computeFacetCounts/dropOneCounts apply those
 * selections themselves. */
export async function getFacetData(q?: string): Promise<FacetProgram[]> {
  const term = q?.trim().replace(/^#/, "").trim();
  const programs = await prisma.program.findMany({
    where: { status: "PUBLISHED" },
    include: { tags: true },
  });
  const matched = term ? rankBySearchTerm(programs, term) : programs;
  return matched.map((p) => ({
    id: p.id,
    durationType: p.durationType,
    tagSlugs: p.tags.map((t) => t.slug),
  }));
}

export async function getProgramBySlug(slug: string) {
  return prisma.program.findUnique({
    where: { slug },
    include: {
      tags: true,
      videos: { orderBy: { createdAt: "desc" } },
      reviews: { where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" } },
    },
  });
}

export function averageRating(reviews: { rating: number }[]) {
  if (reviews.length === 0) return null;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

export async function listAllTags() {
  return prisma.tag.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
}

/** Fetches published programs by slug, preserving the input order. */
export async function getProgramsBySlugs(slugs: string[]) {
  if (slugs.length === 0) return [];
  const programs = await prisma.program.findMany({
    where: { slug: { in: slugs }, status: "PUBLISHED" },
    include: { tags: true, reviews: { where: { status: "PUBLISHED" } } },
  });
  const bySlug = new Map(programs.map((p) => [p.slug, p]));
  return slugs.map((s) => bySlug.get(s)).filter((p): p is NonNullable<typeof p> => Boolean(p));
}

/** Narrow select for surfaces that only need a program's identity, not its full record
 * (description/tags/videos/etc.) -- currently just app/rate/[programSlug]/page.tsx,
 * which needs id (for PollResponse.programId) + name (for form copy) + status (to 404 a
 * non-published program the same way the public program page does). Same
 * "select only what the caller needs" discipline as FOLDER_PROGRAM_SELECT in
 * lib/folders.ts. */
export async function getProgramForRating(slug: string) {
  return prisma.program.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, status: true },
  });
}

export async function listPublishedProgramNames() {
  return prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Every published program with the lightweight fields the /rate program picker needs to
 * fuzzy-rank client-side (the same rankBySearchTerm the directory search uses) -- name,
 * nameHe, organization, location, and tag names/slugs. Deliberately omits description/
 * goodFor: they're heavy free text and low-value for picking a program to rate, so
 * shipping them to the browser isn't worth the payload (see
 * components/RateProgramPicker.tsx). `slug` is for building the fallback rating href
 * server-side, not searched. */
export async function listPublishedProgramsForPicker() {
  return prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      name: true,
      nameHe: true,
      organization: true,
      location: true,
      tags: { select: { name: true, slug: true } },
    },
    orderBy: { name: "asc" },
  });
}

/** Slug + last-modified timestamp for every publicly-reachable program, for
 * app/sitemap.ts. Filtered to PUBLISHED to match app/programs/[slug]/page.tsx's own
 * visibility check -- a PENDING/REJECTED program 404s for anonymous visitors, so it
 * must never appear in the sitemap either. */
export async function listPublishedProgramSlugsForSitemap() {
  return prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, updatedAt: true },
    orderBy: { slug: "asc" },
  });
}

export type ProgramContactEmail = {
  id: string;
  slug: string;
  name: string;
  contactEmail: string | null;
  contactWebsite: string | null;
  websiteLanguage: WebsiteLanguage | null;
  contactEmailStatus: EmailVerificationStatus | null;
  contactEmailVerifiedAt: Date | null;
};

/** Every published program's contact email (plus the fields the admin bulk-email tab
 * needs to section by website language and surface not-yet-verified emails). Queried
 * live so the list grows automatically as programs are added. */
export async function listProgramContactEmails(): Promise<ProgramContactEmail[]> {
  const rows = await prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      name: true,
      contactEmail: true,
      contactWebsite: true,
      websiteLanguage: true,
      contactEmailStatus: true,
      contactEmailVerifiedAt: true,
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ ...r, contactEmail: r.contactEmail?.trim() || null }));
}

/** Admin-only: sets (or clears, with null) a program's detected/corrected website
 * language. See prisma/classify-website-language.ts for the one-time detection pass
 * this overrides/backfills by hand. */
export async function setProgramWebsiteLanguage(id: string, language: WebsiteLanguage | null) {
  return prisma.program.update({ where: { id }, data: { websiteLanguage: language } });
}

/** Admin-only: sets (or clears, with null) a manual override for the outreach tool's
 * category grouping. null means "categorize automatically" -- see
 * lib/outreachCategories.ts's categorizeProgram, which this value feeds into.
 * Validation that `category` is one of CATEGORY_KEYS happens at the API layer
 * (app/api/admin/programs/[id]/outreach-category/route.ts), not here, so this stays a
 * thin Prisma wrapper matching setProgramWebsiteLanguage's shape. */
export async function setProgramOutreachCategory(id: string, category: string | null) {
  return prisma.program.update({ where: { id }, data: { outreachCategory: category } });
}
