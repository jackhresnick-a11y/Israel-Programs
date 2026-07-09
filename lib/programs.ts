import slugify from "slugify";
import { z } from "zod";
import Fuse from "fuse.js";
import { prisma } from "@/lib/prisma";
import { DurationType, Prisma, ProgramStatus, TravelType } from "@/app/generated/prisma/client";
import { recordProgramForExport } from "@/lib/programExport";
import { resolveTagsByName } from "@/lib/tags";

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

export async function createProgram(
  input: ProgramInput,
  createdById: string,
  status: ProgramStatus
) {
  const slug = await uniqueSlug(input.name);
  const tags = await resolveTagsByName(input.tags);
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
  const tags = await resolveTagsByName(input.tags);
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Searchable = {
  name: string;
  organization: string | null;
  location: string | null;
  goodFor: string | null;
  description: string;
  tags: { name: string; slug: string }[];
};

// Fuse bitap-matches the *entire* query string as a single pattern against
// each field -- it never splits "modern orthodox gap year" into words. A
// program whose TAGS collectively cover every word (e.g. yeshiva + gap-year +
// modern-orthodox as three separate tags) has no single field containing the
// whole phrase, so Fuse drops it even though every word is genuinely present
// somewhere on the program. Tokenizing the query and requiring each token to
// match *some* field (not all in the same field) fixes that without giving up
// Fuse's typo tolerance, which still runs in parallel for fuzzy recall.
function tokenize(term: string): string[] {
  return term
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^#/, ""))
    .filter((t) => t.length >= 2);
}

function haystacks(program: Searchable): string[] {
  return [
    program.name,
    program.organization ?? "",
    program.location ?? "",
    program.goodFor ?? "",
    program.description,
    ...program.tags.flatMap((t) => [t.name, t.slug]),
  ].map((s) => s.toLowerCase());
}

/** Every token substring-matches at least one field (not necessarily the same field). */
function matchesAllTokens(program: Searchable, tokens: string[]): boolean {
  const hay = haystacks(program);
  return tokens.every((tok) => hay.some((h) => h.includes(tok)));
}

// Fuse's weighted multi-key blend can let a program that matches several
// low-weight fields fuzzily outrank one with a single strong, literal match --
// there's no "closest match wins" guarantee from field weights alone. This
// tier is computed on top of (not instead of) Fuse's fuzzy candidate set, so a
// literal/near-literal match always sorts above a fuzzy-only one, while Fuse's
// own score still breaks ties within a tier and keeps typo-tolerant recall.
function relevanceTier(
  program: Searchable,
  termLower: string,
  tokens: string[]
): number {
  const name = program.name.toLowerCase();
  const org = program.organization?.toLowerCase() ?? "";
  const tagNames = program.tags.map((t) => t.name.toLowerCase());
  const tagSlugs = program.tags.map((t) => t.slug.toLowerCase());

  if (name === termLower || tagNames.includes(termLower) || tagSlugs.includes(termLower)) {
    return 0; // exact name or exact tag match
  }
  if (name.startsWith(termLower) || org.startsWith(termLower)) {
    return 1; // name/org starts with the whole term
  }
  if (tokens.length > 0) {
    const tokenInNameOrOrg = (tok: string) => {
      const wb = new RegExp(`\\b${escapeRegExp(tok)}`);
      return wb.test(name) || wb.test(org);
    };
    if (tokens.every(tokenInNameOrOrg)) {
      return 1; // every word appears (word-boundary) in the name/org
    }
    const tokenInNameOrgOrTags = (tok: string) =>
      tokenInNameOrOrg(tok) ||
      tagSlugs.some((slug) => slug.startsWith(tok) || slug.includes(tok)) ||
      tagNames.some((n) => n.includes(tok));
    if (tokens.every(tokenInNameOrgOrTags)) {
      return 2; // every word is covered by name/org/tags (not necessarily the same field)
    }
    if (matchesAllTokens(program, tokens)) {
      return 3; // every word is covered somewhere (including location/goodFor/description)
    }
    return 4; // fuzzy-only match (typo-distance)
  }
  const wordBoundary = new RegExp(`\\b${escapeRegExp(termLower)}`);
  if (
    wordBoundary.test(name) ||
    wordBoundary.test(org) ||
    tagSlugs.some((slug) => slug.startsWith(termLower))
  ) {
    return 2; // word-boundary match in name/org, or tag slug prefix
  }
  if (
    name.includes(termLower) ||
    org.includes(termLower) ||
    tagNames.some((t) => t.includes(termLower)) ||
    tagSlugs.some((s) => s.includes(termLower))
  ) {
    return 3; // substring match in name/org/tags
  }
  return 4; // fuzzy-only match (location/goodFor/description or typo-distance)
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
    include: { tags: true, reviews: true },
    orderBy: { createdAt: "desc" },
  });

  if (!term) return programs;

  // Structured filters (status/tags/duration/etc.) run in Postgres above;
  // the free-text term is ranked here in memory. At ~183 published programs
  // this is effectively free and avoids a pg_trgm migration + raw SQL for a
  // dataset this size. The candidate set is the UNION of Fuse's fuzzy matches
  // (typo tolerance) and a deterministic per-token substring match (so a
  // program whose tags collectively cover every query word is never dropped
  // just because no single field contains the whole phrase -- see
  // matchesAllTokens above). relevanceTier then ranks the union so the
  // closest match always surfaces first, with Fuse's own score breaking ties
  // within a tier.
  const fuse = new Fuse(programs, {
    keys: SEARCH_KEYS,
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  });

  const termLower = term.toLowerCase();
  const tokens = tokenize(term);
  const fuseScores = new Map(fuse.search(term).map((r) => [r.item.id, r.score ?? 1]));

  const candidates = programs.filter(
    (p) => fuseScores.has(p.id) || (tokens.length > 0 && matchesAllTokens(p, tokens))
  );

  return candidates
    .map((item) => ({
      item,
      tier: relevanceTier(item, termLower, tokens),
      score: fuseScores.get(item.id) ?? 1,
    }))
    .sort((a, b) => a.tier - b.tier || a.score - b.score || a.item.name.localeCompare(b.item.name))
    .map((result) => result.item);
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
  return prisma.tag.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
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

export type ProgramContactEmail = { id: string; name: string; contactEmail: string | null };

/** Every published program's contact email, for the admin bulk-email tab. Queried live so the list grows automatically as programs are added. */
export async function listProgramContactEmails(): Promise<ProgramContactEmail[]> {
  const rows = await prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, name: true, contactEmail: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ ...r, contactEmail: r.contactEmail?.trim() || null }));
}
