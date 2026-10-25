import { z } from "zod";

/** Shared with app/api/admin/programs/[id]/video/route.ts's historical videoTranscript
 * ceiling -- kept at the same value so a transcript that used to fit still fits as a
 * Transcript row. */
export const MAX_TRANSCRIPT_CHARS = 200_000;

export const PREVIEW_LENGTH = 200;

/** zod's .url() accepts any scheme (javascript:, data:, ...); this restricts to http/https
 *  so a submitted link can never execute script or render as an inline resource when
 *  clicked. Same helper as lib/programs.ts's httpUrl -- duplicated rather than imported
 *  because that module pulls in lib/prisma.ts, which this client-safe file must not. */
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), { message: "Must be a valid http(s) URL" });

export const transcriptEntrySchema = z.object({
  slug: z.string().trim().min(1),
  filename: z.string().trim().min(1),
  text: z.string().max(MAX_TRANSCRIPT_CHARS),
  sourceUrl: httpUrl.optional().or(z.literal("")),
});

/** No confirmOverwrite -- uploading is append-only now, there is nothing to confirm. */
export const bulkTranscriptsSchema = z.object({
  entries: z.array(transcriptEntrySchema).min(1),
});

export const transcriptEditSchema = z.object({
  text: z.string().max(MAX_TRANSCRIPT_CHARS),
});

/** Simple "trim then split on whitespace" word count. */
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
  /** How many transcripts this program already has saved -- purely informational now
   * that uploads never overwrite (0 = "New", >0 = "Adds to N existing"). */
  existingCount: number;
};

export type UnmatchedFile = { filename: string };

/** Matches uploaded .txt files to programs by EXACT slug -- never fuzzy, never
 * normalized (no case-folding, no trimming beyond the required ".txt" suffix and an
 * optional "--<suffix>" disambiguator). A file whose slug portion isn't byte-identical
 * to a real Program.slug is unmatched, same discipline as
 * scripts/transcribe/transcribe.py's filename matching and lib/tags.ts's
 * resolveExistingTagsByName ("typed name must already exist, never fuzzily resolved").
 *
 * "<slug>--<anything>.txt" (e.g. "aish-hatorah--1.txt", "aish-hatorah--2.txt") lets
 * several transcripts attach to the same program in one upload -- the slug is
 * everything before the FIRST "--", so a stray extra "--" in the disambiguator portion
 * doesn't change which program a file matches. A bare "<slug>.txt" still works exactly
 * as before. */
export function matchFilesToSlugs(
  files: { filename: string; text: string }[],
  slugOptions: SlugOption[],
  existingCountBySlug: Map<string, number>
): { matched: MatchedFile[]; unmatched: UnmatchedFile[] } {
  const bySlug = new Map(slugOptions.map((o) => [o.slug, o]));
  const matched: MatchedFile[] = [];
  const unmatched: UnmatchedFile[] = [];

  for (const file of files) {
    if (!file.filename.toLowerCase().endsWith(".txt")) {
      unmatched.push({ filename: file.filename });
      continue;
    }
    const stem = file.filename.slice(0, -4);
    const slug = stem.split("--")[0];
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
      existingCount: existingCountBySlug.get(slug) ?? 0,
    });
  }

  return { matched, unmatched };
}
