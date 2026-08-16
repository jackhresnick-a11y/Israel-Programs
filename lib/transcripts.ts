import { prisma } from "@/lib/prisma";
import { PROGRAM_PRIVATE_OMIT } from "@/lib/programs";
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

export type TranscriptListRow = {
  id: string;
  slug: string;
  name: string;
  wordCount: number;
  preview: string;
  updatedAt: Date;
};

/** Thrown by saveTranscriptsBulk when a batch names a slug with no matching Program --
 * same "typed value must already exist, never fuzzily resolved" shape as
 * lib/finder.ts's UnknownTagSlugsError. */
export class UnknownProgramSlugsError extends Error {
  slugs: string[];
  constructor(slugs: string[]) {
    super(`Unknown program slug(s): ${slugs.join(", ")}`);
    this.name = "UnknownProgramSlugsError";
    this.slugs = slugs;
  }
}

/** Thrown by saveTranscriptsBulk when the batch would overwrite an existing
 * Program.videoTranscript and the caller didn't pass confirmOverwrite -- a destructive
 * field overwrite, so it's refused (not silently applied) until explicitly confirmed,
 * same posture as CLAUDE.md's "(b) field overwrite" database-write rule. */
export class OverwriteConfirmationRequiredError extends Error {
  slugs: string[];
  constructor(slugs: string[]) {
    super(`Overwrite confirmation required for existing transcript(s): ${slugs.join(", ")}`);
    this.name = "OverwriteConfirmationRequiredError";
    this.slugs = slugs;
  }
}

/** Admin-only: every program with a saved transcript, for the "existing transcripts"
 * list on /admin/transcripts. Deliberately never returns the raw videoTranscript text
 * itself into a client component's props (see CLAUDE.md's "Watch what you pass to
 * client components" -- an RSC payload embeds whatever a client component's props
 * carry) -- only the derived wordCount/preview cross that boundary. Full text is
 * fetched lazily and separately (getProgramTranscript) only when an admin clicks Edit. */
export async function listProgramTranscripts(): Promise<TranscriptListRow[]> {
  const rows = await prisma.program.findMany({
    where: { videoTranscript: { not: null } },
    select: { id: true, slug: true, name: true, videoTranscript: true, updatedAt: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    wordCount: countWords(r.videoTranscript ?? ""),
    preview: previewText(r.videoTranscript ?? ""),
    updatedAt: r.updatedAt,
  }));
}

/** Admin-only: the full transcript text for one program, fetched only when the admin
 * opens the edit view for that specific row. */
export async function getProgramTranscript(
  id: string
): Promise<{ id: string; slug: string; name: string; text: string } | null> {
  const row = await prisma.program.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true, videoTranscript: true },
  });
  if (!row) return null;
  return { id: row.id, slug: row.slug, name: row.name, text: row.videoTranscript ?? "" };
}

/** Admin-only: sets (text) or clears (null) one program's transcript. */
export async function setProgramTranscript(id: string, text: string | null) {
  return prisma.program.update({
    where: { id },
    data: { videoTranscript: text },
    omit: PROGRAM_PRIVATE_OMIT,
  });
}

/** Admin-only bulk write for the /admin/transcripts multi-file upload. Re-resolves
 * every slug against the live Program table server-side -- the client's own
 * matchFilesToSlugs match is never trusted -- and, unless confirmOverwrite is true,
 * refuses the WHOLE batch if any slug already carries a transcript. Both checks run
 * before any write, so a rejected batch writes nothing (no partial save). */
export async function saveTranscriptsBulk(
  entries: { slug: string; text: string }[],
  { confirmOverwrite }: { confirmOverwrite: boolean }
): Promise<{ saved: number }> {
  const slugs = entries.map((e) => e.slug);
  const rows = await prisma.program.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, videoTranscript: true },
  });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  const unknown = slugs.filter((slug) => !bySlug.has(slug));
  if (unknown.length > 0) throw new UnknownProgramSlugsError(unknown);

  if (!confirmOverwrite) {
    const overwrites = slugs.filter((slug) => bySlug.get(slug)!.videoTranscript !== null);
    if (overwrites.length > 0) throw new OverwriteConfirmationRequiredError(overwrites);
  }

  await prisma.$transaction(
    entries.map((e) =>
      prisma.program.update({
        where: { id: bySlug.get(e.slug)!.id },
        data: { videoTranscript: e.text || null },
      })
    )
  );

  return { saved: entries.length };
}
