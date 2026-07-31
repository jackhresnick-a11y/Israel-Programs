import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { optionalWhatsappNumberSchema } from "@/lib/phone";
import { POLL_REFERENCE_CONSENT_LABEL, POLL_REFERENCE_CONSENT_VERSION } from "@/lib/pollShared";

export const referenceInputSchema = z.object({
  attendedText: z.string().trim().min(1, "Let people know roughly when you attended").max(200),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
  whatsappNumber: optionalWhatsappNumberSchema,
  consent: z.literal(true, { message: "Please confirm you consent to being listed and to receive contact requests" }),
  // Honeypot -- real users never see or fill this field.
  website: z.string().optional(),
});

export type ReferenceInput = z.infer<typeof referenceInputSchema>;

export async function createReference(
  programId: string,
  input: ReferenceInput,
  identity: { userId: string; displayName: string; contactEmail: string }
) {
  return prisma.reference.create({
    data: {
      programId,
      userId: identity.userId,
      displayName: identity.displayName,
      contactEmail: identity.contactEmail,
      attendedText: input.attendedText,
      note: input.note || undefined,
      // A number can never be written without a source -- on this self-submission
      // path the source is always this generated string, never user input.
      whatsappNumber: input.whatsappNumber,
      whatsappNumberSource: input.whatsappNumber
        ? `self-submitted via reference form ${new Date().toISOString().slice(0, 10)}`
        : undefined,
      status: "PENDING",
      consentGiven: true,
      consentAt: new Date(),
    },
  });
}

/** Public display name for every reference created from the anonymous poll. Deliberately
 * a constant placeholder, NOT the respondent's real name: the poll form collects no name,
 * and the old ContactOptInBlock's name field promised "never shown publicly" -- so a
 * poll-sourced reference must never carry a real name into the public displayName. An
 * admin edits this to a proper display name before publishing. */
export const POLL_REFERENCE_DISPLAY_NAME = "Past participant";

/** A pragmatic "does this parse as an email" check for the poll contact field -- the same
 * gate `z.string().email()` applies, but run HERE (not in anonymousSubmitSchema) so a
 * malformed value skips the reference silently instead of 400-ing the whole poll submit.
 * Mirrors the shape zod validates against. */
export function isValidReferenceEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Creates a PENDING alumni Reference from an anonymous poll submission's single,
 * 18+-gated contact-email field. Entering the email under POLL_REFERENCE_CONSENT_LABEL is
 * itself the consent -- there is no separate contact-consent checkbox -- so the entire
 * gate is: `ageAttested === true` AND the email parses as valid. Anything else is a no-op.
 *
 * Idempotency is enforced at the DB via @@unique([programId, pollEmailKey]) on the
 * normalized (trim+lowercase) email: the guarded upsert makes a re-submit with the same
 * email a deliberate no-op update, never a second row. `userId` is an opaque synthetic
 * (`poll:<responseId>`) because there is no Clerk user here -- it keeps the email out of
 * userId (only contactEmail/pollEmailKey hold it, both admin-gated) and never collides on
 * @@unique([programId, userId]).
 *
 * Cutover: this is only ever called with the email from the CURRENT submission's payload,
 * at submit time. It never reads PollResponse.email, and no backfill exists -- so
 * historical poll responses (whose emails predate this consent language) can never produce
 * a reference. The exact consent label + version are snapshotted onto the row as a
 * permanent record of what was agreed to.
 *
 * The caller (submitAnonymousResponse) wraps this in try/catch so a failure here can never
 * fail the poll submission.
 */
export async function upsertReferenceFromPoll(input: {
  programId: string;
  pollResponseId: string;
  email: string;
  ageAttested: boolean;
  yearAttended: number | null;
}): Promise<void> {
  if (!input.ageAttested) return;
  if (!isValidReferenceEmail(input.email)) return;

  const email = input.email.trim();
  const pollEmailKey = email.toLowerCase();
  const attendedText = input.yearAttended != null ? String(input.yearAttended) : "Not specified";
  const now = new Date();

  await prisma.reference.upsert({
    where: { programId_pollEmailKey: { programId: input.programId, pollEmailKey } },
    create: {
      programId: input.programId,
      userId: `poll:${input.pollResponseId}`,
      displayName: POLL_REFERENCE_DISPLAY_NAME,
      contactEmail: email,
      pollEmailKey,
      pollResponseId: input.pollResponseId,
      attendedText,
      status: "PENDING",
      consentGiven: true,
      consentAt: now,
      consentLabel: POLL_REFERENCE_CONSENT_LABEL,
      consentVersion: POLL_REFERENCE_CONSENT_VERSION,
    },
    // A resubmit with the same email must not create a second row and must not disturb the
    // original consent record -- so the update branch is a deliberate no-op.
    update: {},
  });
}

/**
 * Deliberately selects only the fields the public program page may render.
 * contactEmail/userId/whatsappNumber/whatsappNumberSource/pollEmailKey must never reach a
 * client component's props, since Next.js serializes client-component props
 * into the page's RSC payload -- present in the raw HTML even for fields the
 * JSX never displays. (pollEmailKey holds the poll respondent's email and is gated
 * identically to contactEmail.)
 */
export async function listPublishedReferences(programId: string) {
  return prisma.reference.findMany({
    where: { programId, status: "PUBLISHED" },
    select: { id: true, displayName: true, attendedText: true, note: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function countPublishedReferences(programId: string): Promise<number> {
  return prisma.reference.count({ where: { programId, status: "PUBLISHED" } });
}

export async function listPendingReferences() {
  return prisma.reference.findMany({
    where: { status: "PENDING" },
    include: { program: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * How many PENDING references were created in the last `sinceDays` days. Surfaced as a
 * plain read-only number on /admin/references. Poll-driven reference creation is wrapped
 * (failures are silent by design), so this recent count is the operator's health signal:
 * a 0 here when poll submissions are happening means creation has quietly broken (e.g. the
 * migration hasn't been applied). Uses only pre-existing columns (status, createdAt), so it
 * keeps working even if the poll-reference columns aren't in the DB yet.
 */
export async function countRecentPendingReferences(sinceDays = 7): Promise<number> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  return prisma.reference.count({
    where: { status: "PENDING", createdAt: { gte: since } },
  });
}

/**
 * Admin-only: every reference regardless of status, including contactEmail
 * and whatsappNumber, plus its total contact-request count. Only ever
 * consumed by the admin references page -- never pass the result of this to
 * a client component wholesale.
 */
export async function listAllReferencesForAdmin() {
  const references = await prisma.reference.findMany({
    include: {
      program: { select: { name: true, slug: true } },
      _count: { select: { contactRequests: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return references.map((r) => ({ ...r, requestCount: r._count.contactRequests }));
}

/**
 * Sets or clears whatsappNumber + whatsappNumberSource atomically. A number
 * can never be stored without a source -- callers (the admin PATCH route)
 * are responsible for validating that before calling this, but this is the
 * one write path so we also refuse it here as a backstop.
 */
export async function updateReferenceWhatsapp(
  id: string,
  input: { whatsappNumber: string | null; whatsappNumberSource: string | null }
) {
  if (input.whatsappNumber && !input.whatsappNumberSource) {
    throw new Error("whatsappNumberSource is required whenever whatsappNumber is set");
  }

  return prisma.reference.update({
    where: { id },
    data: {
      whatsappNumber: input.whatsappNumber,
      whatsappNumberSource: input.whatsappNumber ? input.whatsappNumberSource : null,
    },
  });
}

/**
 * Approves a reference, then -- if this publish just brought the program's
 * approved count up to (or past) its ReferenceConfig.minToShow for the first
 * time -- stamps ReferenceConfig.unlockedAt so the public list unlock is
 * sticky (a later drop in count, e.g. an admin disabling one, never re-hides
 * an already-unlocked list). Written at approve time rather than computed on
 * every read, so page reads stay a pure lookup with no write-on-read.
 */
export async function approveReference(id: string) {
  const reference = await prisma.reference.update({ where: { id }, data: { status: "PUBLISHED" } });

  const [approvedCount, config] = await Promise.all([
    prisma.reference.count({ where: { programId: reference.programId, status: "PUBLISHED" } }),
    prisma.referenceConfig.findUnique({ where: { programId: reference.programId } }),
  ]);

  const minToShow = config?.minToShow ?? 1;
  if (!config?.unlockedAt && approvedCount >= minToShow) {
    await prisma.referenceConfig.upsert({
      where: { programId: reference.programId },
      create: { programId: reference.programId, unlockedAt: new Date() },
      update: { unlockedAt: new Date() },
    });
  }

  return reference;
}

export async function rejectReference(id: string) {
  return prisma.reference.update({ where: { id }, data: { status: "REJECTED" } });
}

export async function deleteReference(id: string) {
  return prisma.reference.delete({ where: { id } });
}

export const contactRequestInputSchema = z.object({
  note: z.string().trim().min(1, "Add a short note about why you’re reaching out").max(1000),
  // Honeypot -- real users never see or fill this field.
  website: z.string().optional(),
});

export type ContactRequestInput = z.infer<typeof contactRequestInputSchema>;

function generateContactRequestToken(): string {
  // 192 bits, URL-safe -- same generation as lib/pollTokens.ts's ReferrerToken /
  // lib/folders.ts's Folder.shareToken.
  return randomBytes(24).toString("base64url");
}

/**
 * Creates a pending (AWAITING_ALUMNUS) contact request with a fresh single-use
 * token, and returns the reference's public-facing name/email/program alongside
 * it so the caller can send the alumnus's approval email in one round trip
 * without a second query. reference.contactEmail here is read server-side only
 * for that one send -- callers must never forward it back to the requester's
 * client.
 */
export async function createContactRequest(
  referenceId: string,
  input: ContactRequestInput,
  requester: { userId: string; email: string; name: string }
) {
  const request = await prisma.contactRequest.create({
    data: {
      referenceId,
      requesterUserId: requester.userId,
      requesterEmail: requester.email,
      requesterName: requester.name,
      note: input.note,
      status: "AWAITING_ALUMNUS",
      token: generateContactRequestToken(),
    },
    include: {
      reference: {
        select: {
          displayName: true,
          contactEmail: true,
          program: { select: { name: true, slug: true } },
        },
      },
    },
  });
  return { request };
}

/** All contact requests for references the given user owns, across every program --
 * feeds the read-only /references/requests history page. requesterEmail is included
 * (the alumnus is the reference-giver themselves, and by the time a row is APPROVED
 * they're meant to see it -- withheld in the UI for any other status). */
export async function listContactRequestsForUser(userId: string) {
  return prisma.contactRequest.findMany({
    where: { reference: { userId } },
    include: { reference: { include: { program: { select: { name: true, slug: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

type ContactRequestResolution =
  | {
      ok: true;
      request: { id: string; note: string | null };
      reference: { displayName: string; contactEmail: string };
      requesterEmail: string;
      requesterName: string;
      program: { name: string; slug: string };
    }
  | { ok: false; reason: "not_found" | "already_resolved"; status?: "APPROVED" | "DECLINED" | "EXPIRED" };

async function findAwaitingRequestByToken(token: string) {
  return prisma.contactRequest.findUnique({
    where: { token },
    include: {
      reference: {
        select: {
          displayName: true,
          contactEmail: true,
          program: { select: { name: true, slug: true } },
        },
      },
    },
  });
}

/** Safe, pre-decision fields for the approve/decline confirmation pages --
 * never includes reference.contactEmail or requesterEmail, since nothing is
 * revealed until the alumnus actually clicks Approve. */
export async function getContactRequestPreviewByToken(token: string) {
  const row = await findAwaitingRequestByToken(token);
  if (!row) return null;
  return {
    status: row.status,
    note: row.note,
    requesterName: row.requesterName,
    programName: row.reference.program.name,
    alumnusFirstName: row.reference.displayName.split(" ")[0],
  };
}

/**
 * Approves a contact request. Idempotent: a request that's already resolved
 * (a second click, a stale tab) returns `already_resolved` with its current
 * status rather than re-sending intro emails or erroring. This is the only
 * function that surfaces Reference.contactEmail alongside the requester's
 * email in the same return value -- callers must only use that pairing to
 * send the one-time intro emails, never to render either address to a page.
 */
export async function approveContactRequest(token: string): Promise<ContactRequestResolution> {
  const row = await findAwaitingRequestByToken(token);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "AWAITING_ALUMNUS") {
    return { ok: false, reason: "already_resolved", status: row.status as "APPROVED" | "DECLINED" | "EXPIRED" };
  }

  const updated = await prisma.contactRequest.updateMany({
    where: { id: row.id, status: "AWAITING_ALUMNUS" },
    data: { status: "APPROVED", resolvedAt: new Date() },
  });
  // Lost a race with the cron sweep or a concurrent click -- treat as already resolved.
  if (updated.count === 0) return { ok: false, reason: "already_resolved" };

  return {
    ok: true,
    request: { id: row.id, note: row.note },
    reference: { displayName: row.reference.displayName, contactEmail: row.reference.contactEmail },
    requesterEmail: row.requesterEmail,
    requesterName: row.requesterName,
    program: row.reference.program,
  };
}

export type ContactRequestDeclineResult =
  | { ok: true; requesterEmail: string; program: { name: string; slug: string } }
  | { ok: false; reason: "not_found" | "already_resolved" };

export async function declineContactRequest(token: string): Promise<ContactRequestDeclineResult> {
  const row = await findAwaitingRequestByToken(token);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "AWAITING_ALUMNUS") return { ok: false, reason: "already_resolved" };

  const updated = await prisma.contactRequest.updateMany({
    where: { id: row.id, status: "AWAITING_ALUMNUS" },
    data: { status: "DECLINED", resolvedAt: new Date() },
  });
  if (updated.count === 0) return { ok: false, reason: "already_resolved" };

  return { ok: true, requesterEmail: row.requesterEmail, program: row.reference.program };
}

const REMINDER_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const EXPIRE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export type DueReminderRow = {
  id: string;
  token: string;
  note: string | null;
  requesterName: string;
  alumnusEmail: string;
  programName: string;
};

/** Requests still AWAITING_ALUMNUS, created more than 3 days ago, that haven't
 * had their one reminder sent yet -- feeds the daily cron sweep. */
export async function listDueReminders(): Promise<DueReminderRow[]> {
  const cutoff = new Date(Date.now() - REMINDER_AFTER_MS);
  const rows = await prisma.contactRequest.findMany({
    where: { status: "AWAITING_ALUMNUS", reminderSent: false, createdAt: { lt: cutoff } },
    include: {
      reference: {
        select: { contactEmail: true, program: { select: { name: true } } },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    note: r.note,
    requesterName: r.requesterName,
    alumnusEmail: r.reference.contactEmail,
    programName: r.reference.program.name,
  }));
}

/** Sets reminderSent so a request's one reminder can never fire twice, even if
 * the cron sweep runs again before the request is otherwise resolved. */
export async function markReminderSent(id: string) {
  return prisma.contactRequest.update({ where: { id }, data: { reminderSent: true } });
}

export type ExpiredCandidateRow = {
  id: string;
  requesterEmail: string;
  programName: string;
};

/** Requests still AWAITING_ALUMNUS more than 30 days after creation -- feeds
 * the daily cron sweep's expiry pass. No deadline is ever shown to either
 * party; this is purely a quiet background cutoff. */
export async function listExpiredCandidates(): Promise<ExpiredCandidateRow[]> {
  const cutoff = new Date(Date.now() - EXPIRE_AFTER_MS);
  const rows = await prisma.contactRequest.findMany({
    where: { status: "AWAITING_ALUMNUS", createdAt: { lt: cutoff } },
    include: { reference: { select: { program: { select: { name: true } } } } },
  });
  return rows.map((r) => ({ id: r.id, requesterEmail: r.requesterEmail, programName: r.reference.program.name }));
}

export async function expireContactRequest(id: string) {
  return prisma.contactRequest.updateMany({
    where: { id, status: "AWAITING_ALUMNUS" },
    data: { status: "EXPIRED", resolvedAt: new Date() },
  });
}
