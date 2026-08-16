import { z } from "zod";

/** Shared with app/api/admin/programs/[id]/video/route.ts's videoTranscript zod schema
 * -- the two admin surfaces write the same Program.videoTranscript column, so they must
 * agree on the ceiling or a transcript saved via one becomes unsaveable via the other. */
export const MAX_TRANSCRIPT_CHARS = 200_000;

export const PREVIEW_LENGTH = 200;

export const transcriptEntrySchema = z.object({
  slug: z.string().trim().min(1),
  text: z.string().max(MAX_TRANSCRIPT_CHARS),
});

export const bulkTranscriptsSchema = z.object({
  entries: z.array(transcriptEntrySchema).min(1),
  confirmOverwrite: z.boolean(),
});

export const transcriptEditSchema = z.object({
  text: z.string().max(MAX_TRANSCRIPT_CHARS),
});

/** Same "trim then split on whitespace" convention as ProgramsAdminManager.tsx's
 * aiBriefWordCount, applied here to the (much longer) raw transcript. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function previewText(text: string, maxLength: number = PREVIEW_LENGTH): string {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export type SlugOption = { id: string; slug: string; name: string };

export type MatchedFile = {
  filename: string;
  slug: string;
  programId: string;
  programName: string;
  text: string;
  wordCount: number;
  preview: string;
  /** null = this program has no existing transcript (a "New" row); a number = the word
   * count of what's already saved (an "Overwrite" row). */
  previousWordCount: number | null;
};

export type UnmatchedFile = { filename: string };

/** Matches uploaded .txt files to programs by EXACT slug -- never fuzzy, never
 * normalized (no case-folding, no trimming beyond the required ".txt" suffix). A file
 * whose stem isn't byte-identical to a real Program.slug is unmatched, same discipline
 * as scripts/transcribe/transcribe.py's filename matching and lib/tags.ts's
 * resolveExistingTagsByName ("typed name must already exist, never fuzzily resolved"). */
export function matchFilesToSlugs(
  files: { filename: string; text: string }[],
  slugOptions: SlugOption[],
  existingWordCountBySlug: Map<string, number>
): { matched: MatchedFile[]; unmatched: UnmatchedFile[] } {
  const bySlug = new Map(slugOptions.map((o) => [o.slug, o]));
  const matched: MatchedFile[] = [];
  const unmatched: UnmatchedFile[] = [];

  for (const file of files) {
    if (!file.filename.toLowerCase().endsWith(".txt")) {
      unmatched.push({ filename: file.filename });
      continue;
    }
    const slug = file.filename.slice(0, -4);
    const program = bySlug.get(slug);
    if (!program) {
      unmatched.push({ filename: file.filename });
      continue;
    }
    matched.push({
      filename: file.filename,
      slug,
      programId: program.id,
      programName: program.name,
      text: file.text,
      wordCount: countWords(file.text),
      preview: previewText(file.text),
      previousWordCount: existingWordCountBySlug.get(slug) ?? null,
    });
  }

  return { matched, unmatched };
}
