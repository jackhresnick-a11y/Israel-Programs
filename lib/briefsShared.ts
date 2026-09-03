/**
 * Split out from lib/briefs.ts because that file imports the Prisma client (via
 * lib/prisma.ts, which pulls in `pg`) -- this file holds only the pure constant/
 * function that a "use client" admin component needs (the copy-to-clipboard button on
 * /admin/briefs), following the same split as lib/pollShared.ts / lib/tagTints.ts.
 */

/** The exact string an admin pastes back when a program's transcripts don't contain
 * enough to write this brief type. Matched verbatim after trimming -- "Insufficient
 * transcript" or "INSUFFICIENT." are NOT the sentinel, only this exact word is. */
export const INSUFFICIENT_SENTINEL = "INSUFFICIENT";

/** True only for an exact (after trim) match on INSUFFICIENT_SENTINEL -- never a
 * substring or case-insensitive match, so a brief that happens to discuss
 * "insufficient program funding" is never mistaken for the sentinel. */
export function isInsufficientPaste(text: string): boolean {
  return text.trim() === INSUFFICIENT_SENTINEL;
}

/** Every one of a program's transcripts, concatenated in upload order and labeled by
 * filename -- the shared "here is all the source material" block both the copy button
 * (below) and the retargeted AI "Generate" route (as the user message, with the brief
 * type's promptText as the system prompt) build from, so a hand-pasted draft and an
 * AI-generated one are always answering the same question about the same material. */
export function joinTranscripts(transcripts: { filename: string; text: string }[]): string {
  return transcripts.map((t) => `--- ${t.filename} ---\n${t.text}`).join("\n\n");
}

/** Builds the exact text an admin copies into an external Claude conversation: the
 * brief type's stored prompt, then joinTranscripts's block. */
export function buildCopyPayload(
  promptText: string,
  transcripts: { filename: string; text: string }[]
): string {
  const transcriptBlock = joinTranscripts(transcripts);
  return transcriptBlock ? `${promptText}\n\n${transcriptBlock}` : promptText;
}
