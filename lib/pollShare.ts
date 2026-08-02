/**
 * Pure message/URL building for the post-poll WhatsApp share button
 * (components/polls/WhatsAppShareButton.tsx). No Prisma, no DOM -- safe to unit test and
 * safe to import from a client component.
 *
 * TODO(copy): placeholder -- owner will rewrite the actual wording. Only the structure
 * (program name + link, "direct" vs "generic" variant) is meant to be load-bearing here.
 */

/**
 * "direct": the program's own public poll link is available (ProgramPollConfig.pollLinkPublic
 * is on) -- the message can name the exact link a friend should open.
 * "generic": no public link for this program -- falls back to the site's /rate picker, so
 * the message can't promise a specific pre-filled program and says so.
 */
export type ShareMessageKind = "direct" | "generic";

export function buildShareMessage(programName: string, kind: ShareMessageKind): string {
  if (kind === "generic") {
    return `Takes 2 minutes, no login. Help ${programName}'s page go live for next year's applicants — find it on Israel Programs Wiki:`;
  }
  return `Takes 2 minutes, no login. Once enough of us fill this out, ${programName}'s page goes public — real answers for next year's applicants, not the brochure version.`;
}

export function buildWhatsAppHref(message: string, absoluteUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${message}\n${absoluteUrl}`)}`;
}
