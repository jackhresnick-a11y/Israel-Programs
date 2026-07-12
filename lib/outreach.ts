import { prisma } from "@/lib/prisma";
import { getDurationLabelMap } from "@/lib/duration";
import { recordEmailVerification } from "@/lib/emailVerification";
import type { EmailVerificationStatus, OutreachStatus } from "@/app/generated/prisma/client";

const LISTING_BASE_URL = "https://israelprogramswiki.com/programs";

/** Merge-field values available to renderOutreachTemplate. contactName is always
 * undefined today -- Program has no contact-person-name column, and inventing one is
 * off the table -- so {contactName|"there"} always falls back to "there". Kept as a
 * named field (not hardcoded) so a future contactName column plugs in without
 * touching the template syntax. */
type MergeFields = {
  contactName?: string;
  programName: string;
  listingUrl: string;
  programDescriptor: string;
};

/** Builds "your <duration> program in <location>" (or without the "in ..." clause if
 * location is null) strictly from Program.durationType (via the admin-editable label
 * map, so it stays in sync with /admin/tags) and Program.location -- no other field,
 * no invented wording. Some admin-set labels already end in "program" (the SUMMER
 * default is "Summer Program") -- the trailing " program" is only appended if the
 * label doesn't already end with that word, so it never doubles up regardless of what
 * an admin types into a DurationOption label. */
function buildProgramDescriptor(
  durationType: string,
  location: string | null,
  durationLabels: Record<string, string>
): string {
  const label = (durationLabels[durationType] ?? durationType).toLowerCase();
  const withNoun = label.endsWith("program") ? label : `${label} program`;
  return location ? `your ${withNoun} in ${location}` : `your ${withNoun}`;
}

const MERGE_FIELD_RE = /\{(\w+)(?:\|"([^"]*)")?\}/g;

/** Renders a subject/body template against one program's merge fields. Unrecognized
 * placeholders (e.g. a typo) are left untouched rather than silently dropped, so a
 * mistake is visible in the admin preview instead of vanishing. */
export function renderOutreachTemplate(
  template: string,
  fields: MergeFields
): string {
  return template.replace(MERGE_FIELD_RE, (match, name: string, fallback: string | undefined) => {
    const value = fields[name as keyof MergeFields];
    if (value) return value;
    return fallback ?? match;
  });
}

async function buildMergeFieldsFor(
  program: { slug: string; name: string; durationType: string; location: string | null },
  durationLabels: Record<string, string>
): Promise<MergeFields> {
  return {
    programName: program.name,
    listingUrl: `${LISTING_BASE_URL}/${program.slug}`,
    programDescriptor: buildProgramDescriptor(program.durationType, program.location, durationLabels),
  };
}

// contactEmailStatus is nullable, and the overwhelming common case is null (never
// checked) -- written as an explicit OR rather than `notIn` so there's no reliance on
// how Prisma translates NULL through a NOT IN filter for this safety-critical
// exclusion (a bounced/wrong-contact address must never be draftable or sendable).
const EXCLUDED_STATUSES: EmailVerificationStatus[] = ["BOUNCED", "WRONG_CONTACT"];

const ELIGIBLE_WHERE = {
  status: "PUBLISHED" as const,
  contactEmail: { not: null },
  contactEmailSource: { not: null },
  OR: [{ contactEmailStatus: null }, { contactEmailStatus: { notIn: EXCLUDED_STATUSES } }],
};

/** Eligible = published, has a contactEmail with recorded provenance (the exact page
 * URL it was observed on -- see contactEmailSource), and not already known-bad. Joined
 * with any existing OutreachEmail row (draft/sent/etc). Programs with an email but no
 * source ("needs source check") are returned separately -- never eligible to draft or
 * send, since an unsourced address has no provenance to stand behind. */
export async function listOutreachQueue() {
  const [eligible, needsSourceCheck] = await Promise.all([
    prisma.program.findMany({
      where: ELIGIBLE_WHERE,
      select: {
        id: true,
        slug: true,
        name: true,
        location: true,
        durationType: true,
        contactEmail: true,
        contactEmailSource: true,
        websiteLanguage: true,
        outreachEmail: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.program.findMany({
      where: {
        status: "PUBLISHED",
        contactEmail: { not: null },
        contactEmailSource: null,
      },
      select: { id: true, slug: true, name: true, contactEmail: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { eligible, needsSourceCheck };
}

/** Upserts a DRAFT OutreachEmail for every eligible program missing one. Never
 * overwrites a row with edited: true (a hand-tuned draft survives regeneration), and
 * never touches a row that has moved past DRAFT (APPROVED/SENT/etc. are left alone --
 * regenerating drafts is not a way to undo a send or an outcome). */
export async function generateDrafts(subjectTemplate: string, bodyTemplate: string) {
  const { eligible } = await listOutreachQueue();
  const durationLabels = await getDurationLabelMap();

  let created = 0;
  let skippedExisting = 0;

  for (const program of eligible) {
    if (program.outreachEmail) {
      skippedExisting++;
      continue;
    }
    const fields = await buildMergeFieldsFor(program, durationLabels);
    const subject = renderOutreachTemplate(subjectTemplate, fields);
    const body = renderOutreachTemplate(bodyTemplate, fields);

    await prisma.outreachEmail.create({
      data: {
        programId: program.id,
        toEmail: program.contactEmail!,
        subject,
        body,
      },
    });
    created++;
  }

  return { created, skippedExisting };
}

/** DRAFT-only: subject/body/toEmail can only be hand-edited before approval, so a
 * SENT/BOUNCED/etc. row's history (and the audit trail send-batch relies on) can
 * never be rewritten after the fact. Setting toEmail marks toEmailOverridden: true,
 * which is what lets send-batch's stale-address drift guard distinguish "admin
 * redirected this on purpose" from "the program's contactEmail changed underneath
 * it" -- see the schema comment on OutreachEmail.toEmailOverridden. */
export async function updateDraft(
  id: string,
  input: { subject?: string; body?: string; toEmail?: string }
) {
  const existing = await prisma.outreachEmail.findUniqueOrThrow({ where: { id } });
  if (existing.status !== "DRAFT") {
    throw new Error("Only DRAFT rows can be edited");
  }

  const data: { subject?: string; body?: string; toEmail?: string; toEmailOverridden?: boolean; edited: boolean } = {
    edited: true,
  };
  if (input.subject !== undefined) data.subject = input.subject;
  if (input.body !== undefined) data.body = input.body;
  if (input.toEmail !== undefined) {
    data.toEmail = input.toEmail;
    data.toEmailOverridden = true;
  }
  return prisma.outreachEmail.update({ where: { id }, data });
}

export async function approveDrafts(ids: string[], adminId: string) {
  return prisma.outreachEmail.updateMany({
    where: { id: { in: ids }, status: "DRAFT" },
    data: { status: "APPROVED", approvedById: adminId, approvedAt: new Date() },
  });
}

/** Deletes OutreachEmail rows only -- Program is never touched by this function (no
 * Program read, no Program write; the where-clause only ever matches OutreachEmail
 * rows by id/status). Restricted to DRAFT/APPROVED: a SENT/BOUNCED/REPLIED/
 * WRONG_CONTACT row is the outreach history and, for SENT rows, the resendId that
 * lets a later bounce webhook find its way back -- deleting one would silently erase
 * the send record and orphan any bounce that arrives afterward. Returns the actual
 * deleted count so the caller can tell the admin when some selected rows were
 * protected and skipped rather than silently doing less than asked. */
export async function deleteDrafts(ids: string[]) {
  return prisma.outreachEmail.deleteMany({
    where: { id: { in: ids }, status: { in: ["DRAFT", "APPROVED"] } },
  });
}

/** REPLIED and WRONG_CONTACT/VERIFIED share the same append-only audit log as the
 * /admin/email-verification queue -- recordEmailVerification is called for the two
 * outcomes that are also meaningful verification signals (VERIFIED confirms the
 * address is live and monitored; WRONG_CONTACT means the address itself is bad).
 * REPLIED only updates OutreachEmail -- a reply doesn't by itself confirm the address
 * belongs to the right person, so it isn't asserted as VERIFIED automatically. */
export async function markOutreachOutcome(
  outreachId: string,
  outcome: Extract<OutreachStatus, "REPLIED" | "WRONG_CONTACT">,
  adminId: string,
  note?: string
) {
  const row = await prisma.outreachEmail.update({
    where: { id: outreachId },
    data: { status: outcome, note: note ?? undefined },
  });

  if (outcome === "WRONG_CONTACT") {
    await recordEmailVerification(row.programId, "WRONG_CONTACT", adminId, note);
  }

  return row;
}

export async function markOutreachVerified(outreachId: string, adminId: string, note?: string) {
  const row = await prisma.outreachEmail.findUniqueOrThrow({ where: { id: outreachId } });
  await recordEmailVerification(row.programId, "VERIFIED", adminId, note);
  return row;
}

/** Called by the Resend bounce webhook (app/api/webhooks/resend/route.ts) after
 * signature verification. Looks up the OutreachEmail row by Resend's message id
 * (resendId, set at send time) -- returns null with no write if no row matches, since
 * this Resend account may send other mail (e.g. lib/email.ts's sendContactEmail) that
 * the outreach feature has no row for and shouldn't touch. checkedById is a fixed
 * string, not a real admin user id, matching the audit log's existing convention for
 * non-human actors (see prisma/import-researched.ts's IMPORT_USER_ID). */
export async function markOutreachBouncedByResendId(resendId: string, note: string) {
  const row = await prisma.outreachEmail.findUnique({ where: { resendId } });
  if (!row) return null;

  const updated = await prisma.outreachEmail.update({
    where: { id: row.id },
    data: { status: "BOUNCED", note },
  });
  await recordEmailVerification(row.programId, "BOUNCED", "resend-webhook", note);
  return updated;
}
