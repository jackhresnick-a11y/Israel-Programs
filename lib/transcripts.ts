import { prisma } from "@/lib/prisma";
import { countWords, previewText } from "@/lib/transcriptsShared";

// Re-exported so route handlers and the client manager can import everything they need
// from one module apiece -- server code from here, "use client" code from
// transcriptsShared directly (that file has no Prisma import, per the client-module-
// split precedent lib/tagTints.ts/lib/pollShared.ts set).
export {
  MAX_TRANSCRIPT_CHARS,
  PREVIEW_LENGTH,
  countWords,
  previewText,
  matchFilesToSlugs,
  transcriptEntrySchema,
  bulkTranscriptsSchema,
  transcriptEditSchema,
} from "@/lib/transcriptsShared";
export type { SlugOption, MatchedFile, UnmatchedFile } from "@/lib/transcriptsShared";

export type TranscriptRow = {
  id: string;
  filename: string;
  sourceUrl: string | null;
  wordCount: number;
  preview: string;
  createdAt: Date;
};

export type ProgramTranscriptGroup = {
  programId: string;
  slug: string;
  name: string;
  transcripts: TranscriptRow[];
};

/** Thrown by saveTranscriptsBulk when a batch names a slug with no matching Program --
 * same "typed value must already exist, never fuzzily resolved" shape as
 * lib/tagSlugValidation.ts's UnknownTagSlugsError. */
export class UnknownProgramSlugsError extends Error {
  slugs: string[];
  constructor(slugs: string[]) {
    super(`Unknown program slug(s): ${slugs.join(", ")}`);
    this.name = "UnknownProgramSlugsError";
    this.slugs = slugs;
  }
}

/** True for a Prisma "table/column does not exist" error (P2021/P2022) -- the state this
 * repo's own migration-ordering trap produces (see CLAUDE.md's "migration ordering is
 * code-last" section) if this code runs before 20260903000000_add_program_briefs is
 * applied. Read paths below degrade to empty rather than 500ing so /admin/transcripts
 * (and anything else reading Transcript rows) stays up -- the feature is simply inert
 * until the table exists. Write paths deliberately do NOT get this treatment: there is
 * no sensible "degrade to empty" for an admin upload, so a write against a missing table
 * fails loudly, same asymmetry as lib/pollElaborations.ts's isMissingTableError. */
function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("code" in err)) return false;
  return err.code === "P2021" || err.code === "P2022";
}

/** Admin-only: every program with at least one saved transcript, for the "existing
 * transcripts" list on /admin/transcripts. Deliberately never returns raw transcript
 * text into a client component's props (see CLAUDE.md's "Watch what you pass to client
 * components" -- an RSC payload embeds whatever a client component's props carry) --
 * only the derived wordCount/preview cross that boundary. Full text is fetched lazily
 * and separately (getTranscriptById) only when an admin clicks Edit on one specific
 * row. */
export async function listProgramTranscripts(): Promise<ProgramTranscriptGroup[]> {
  try {
    const programs = await prisma.program.findMany({
      where: { transcripts: { some: {} } },
      select: {
        id: true,
        slug: true,
        name: true,
        transcripts: {
          select: { id: true, filename: true, sourceUrl: true, text: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
    return programs.map((p) => ({
      programId: p.id,
      slug: p.slug,
      name: p.name,
      transcripts: p.transcripts.map((t) => ({
        id: t.id,
        filename: t.filename,
        sourceUrl: t.sourceUrl,
        wordCount: countWords(t.text),
        preview: previewText(t.text),
        createdAt: t.createdAt,
      })),
    }));
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

/** Admin-only: the full text of one transcript row, fetched only when the admin opens
 * the edit view for that specific row. Keyed by Transcript id (a program can now have
 * several rows), not Program id. */
export async function getTranscriptById(id: string): Promise<{
  id: string;
  programId: string;
  slug: string;
  programName: string;
  filename: string;
  sourceUrl: string | null;
  text: string;
} | null> {
  try {
    const row = await prisma.transcript.findUnique({
      where: { id },
      include: { program: { select: { slug: true, name: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      programId: row.programId,
      slug: row.program.slug,
      programName: row.program.name,
      filename: row.filename,
      sourceUrl: row.sourceUrl,
      text: row.text,
    };
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

/** Admin-only: edits one transcript row's text in place. Deliberately does NOT set
 * needsRegeneration on that program's briefs -- that trigger is reserved for a new
 * transcript being uploaded (see saveTranscriptsBulk), not a correction to text that
 * was already there. */
export async function updateTranscriptText(id: string, text: string) {
  return prisma.transcript.update({ where: { id }, data: { text } });
}

/** Admin-only: deletes one transcript row. */
export async function deleteTranscript(id: string) {
  return prisma.transcript.delete({ where: { id } });
}

/** Admin-only bulk write for the /admin/transcripts multi-file upload. Re-resolves every
 * slug against the live Program table server-side -- the client's own matchFilesToSlugs
 * match is never trusted. Append-only: every entry inserts a NEW Transcript row, never
 * overwriting an existing one -- several files can share a slug in one batch (via
 * "<slug>--1.txt"/"<slug>--2.txt"), and re-uploading a slug later just adds another row.
 * In the same transaction, every non-ARCHIVED ProgramBrief belonging to an affected
 * program is flagged needsRegeneration = true and has any insufficient flag cleared --
 * new source material is worth a fresh look either way (see ProgramBrief.insufficient's
 * doc comment in schema.prisma). */
export async function saveTranscriptsBulk(
  entries: { slug: string; filename: string; text: string; sourceUrl?: string }[]
): Promise<{ saved: number }> {
  const slugs = [...new Set(entries.map((e) => e.slug))];
  const rows = await prisma.program.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  const unknown = slugs.filter((slug) => !bySlug.has(slug));
  if (unknown.length > 0) throw new UnknownProgramSlugsError(unknown);

  const programIds = [...new Set(entries.map((e) => bySlug.get(e.slug)!.id))];

  await prisma.$transaction([
    ...entries.map((e) =>
      prisma.transcript.create({
        data: {
          programId: bySlug.get(e.slug)!.id,
          filename: e.filename,
          text: e.text,
          sourceUrl: e.sourceUrl || null,
        },
      })
    ),
    prisma.programBrief.updateMany({
      where: { programId: { in: programIds }, status: { not: "ARCHIVED" } },
      data: { needsRegeneration: true, insufficient: false, insufficientAt: null },
    }),
  ]);

  return { saved: entries.length };
}
