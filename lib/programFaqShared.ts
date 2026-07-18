/**
 * Split out from lib/programFaq.ts because that file imports the Prisma client (via
 * lib/prisma.ts, which pulls in `pg`) -- this file holds only the pure types/zod a
 * client component needs, same split as lib/tagTints.ts / lib/pollShared.ts.
 */
import { z } from "zod";

/** The public "Ask a question" submission. `website` is a honeypot field real users
 * never fill in (app/api/contact/route.ts precedent) -- an unmodified `.optional()`
 * string, not `.max(0)`, so a bot filling it in doesn't get a 400 that gives away the
 * honeypot's existence; the route silently reports success instead. `consent` must be
 * the literal `true` -- same three-layer enforcement as lib/pollShared.ts's
 * reviewInputSchema (client only sends this when the box is checked, this zod literal,
 * and the DB's hand-written conditional CHECK on ProgramFAQ). */
export const faqQuestionSubmitSchema = z.object({
  question: z.string().trim().min(1).max(500),
  consent: z.literal(true),
  website: z.string().optional(),
});

/** One published FAQ entry as rendered on the public program page -- never carries
 * status/source/consent/ipHash/moderator fields, same RSC-payload-leak rule this
 * codebase applies to every model with a public/sensitive split. `answer` is always a
 * non-empty string here (lib/programFaq.ts's listPublishedFaqs only selects rows that
 * passed the "can't publish without an answer" guard). */
export type ProgramFaqDTO = {
  id: string;
  question: string;
  answer: string;
};

/** Shown once, above the "Ask a question" form -- plain context, not a legal notice.
 * Mirrors the poll-review consent context sentence in components/polls/RateForm.tsx. */
export const FAQ_CONSENT_CONTEXT =
  "Questions are reviewed by a moderator before an answer is published, and may not be published at all.";

export const FAQ_CONSENT_LABEL =
  "I understand this question may be published publicly on this program's page.";
