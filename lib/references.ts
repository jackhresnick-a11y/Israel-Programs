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

/** 192 bits, URL-safe -- same generation as this file's generateContactRequestToken,
 * lib/pollTokens.ts's ReferrerToken, and lib/folders.ts's Folder.shareToken. Never
 * derived from the reference's id, program, or email: the whole point is that holding
 * the link proves nothing except that we gave it to you. */
function generateRemovalToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Runs a query that touches a column added by the pending removal-token migration, and
 * returns `empty` instead of throwing when that column isn't in the database yet. Used on
 * the removal updateMany as well as the reads, so a pre-migration removal attempt reports
 * "link not found" rather than 500ing at someone trying to unlist themselves.
 *
 * This exists because of the exact trap CLAUDE.md documents at length: a preview or
 * production deployment carrying code that selects a not-yet-migrated column 500s with
 * Prisma P2022 / Postgres 42703, and the reads wrapped here sit on pages (the admin
 * queue, the public removal link) where a 500 is much worse than an empty result.
 * Migration ordering is still code-last -- this is the safety net, not the plan.
 *
 * Deliberately narrow: it only swallows the missing-column error. Any other failure
 * propagates, because "the database is down" must not silently render as "you have no
 * pending references."
 */
async function emptyIfColumnMissing<T>(run: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === "P2022" || message.includes("42703")) {
      console.error("[references] removal-token migration not applied yet; degrading to empty", message);
      return empty;
    }
    throw err;
  }
}

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
      removalToken: generateRemovalToken(),
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
 * Creates a PENDING alumni Reference from a poll submission's single, 18+-gated
 * contact-email field. Entering the email under POLL_REFERENCE_CONSENT_LABEL is itself the
 * consent -- there is no separate contact-consent checkbox -- so the entire gate is:
 * `ageAttested === true` AND the email parses as valid. Anything else is a no-op.
 *
 * Idempotency is enforced at the DB, but against DIFFERENT uniques depending on whether we
 * know who the respondent is:
 *
 * - **Anonymous** (`userId: null`): keyed on @@unique([programId, pollEmailKey]) over the
 *   normalized (trim+lowercase) email -- the only identity available. `userId` gets an
 *   opaque synthetic (`poll:<responseId>`) so it can never collide on
 *   @@unique([programId, userId]) and so the email stays out of userId (only
 *   contactEmail/pollEmailKey hold it, both admin-gated).
 * - **Signed in**: keyed on @@unique([programId, userId]) over the real Clerk id. This
 *   matters because components/ReferenceForm.tsx already creates references keyed that way:
 *   without this branch, the same person offering to be a reference through both surfaces
 *   would produce TWO rows for one program (differing on both uniques -- real userId +
 *   null pollEmailKey vs. synthetic userId + set pollEmailKey), both landing in the pending
 *   queue where an admin could publish each of them.
 *
 * Either way the update branch is a deliberate no-op: a re-submit must never create a
 * second row nor disturb the original consent record.
 *
 * Cutover: this is only ever called with the email staged by the CURRENT response, at
 * submit time. It never reads PollResponse.email, and no backfill exists -- so historical
 * poll responses (whose emails predate this consent language) can never produce a
 * reference. The exact consent label + version are snapshotted onto the row as a permanent
 * record of what was agreed to.
 *
 * The caller (lib/pollResponses.ts's finalizeReferenceFromPoll) wraps this in try/catch so
 * a failure here can never fail the poll submission.
 */
export async function upsertReferenceFromPoll(input: {
  programId: string;
  pollResponseId: string;
  /** The real Clerk id when the respondent was signed in; null on the anonymous path. */
  userId?: string | null;
  email: string;
  ageAttested: boolean;
  yearAttended: number | null;
}): Promise<{ removalToken: string | null } | null> {
  if (!input.ageAttested) return null;
  if (!isValidReferenceEmail(input.email)) return null;

  const email = input.email.trim();
  const pollEmailKey = email.toLowerCase();
  const attendedText = input.yearAttended != null ? String(input.yearAttended) : "Not specified";
  const now = new Date();

  const create = {
    programId: input.programId,
    userId: input.userId ?? `poll:${input.pollResponseId}`,
    displayName: POLL_REFERENCE_DISPLAY_NAME,
    contactEmail: email,
    pollEmailKey,
    pollResponseId: input.pollResponseId,
    attendedText,
    status: "PENDING" as const,
    consentGiven: true,
    consentAt: now,
    consentLabel: POLL_REFERENCE_CONSENT_LABEL,
    consentVersion: POLL_REFERENCE_CONSENT_VERSION,
    removalToken: generateRemovalToken(),
  };

  // `update: {}` stays a deliberate no-op -- a re-submit must never disturb the original
  // consent record, and that now covers the removal token too: rotating it on re-submit
  // would silently break a link the respondent may already have saved. The select is what
  // lets the caller hand the token to the browser that just submitted; on a re-submit it
  // returns the token minted the first time (or null for a row predating this column).
  const reference = await prisma.reference.upsert({
    where: input.userId
      ? { programId_userId: { programId: input.programId, userId: input.userId } }
      : { programId_pollEmailKey: { programId: input.programId, pollEmailKey } },
    create,
    update: {},
    select: { removalToken: true },
  });

  return { removalToken: reference.removalToken };
}

/**
 * Resolves a self-removal link. Selects only what the confirmation page renders -- no
 * email, no displayName, nothing that would put a reference-giver's details into a page
 * anyone holding a guessed URL could load. Returns null for an unknown token, which the
 * page renders as "link not found" (the same shape as the contact-request token pages).
 */
export async function getReferenceByRemovalToken(token: string) {
  return emptyIfColumnMissing(
    () =>
      prisma.reference.findUnique({
        where: { removalToken: token },
        select: { id: true, removedAt: true, program: { select: { name: true } } },
      }),
    null
  );
}

/**
 * The reference-giver's own way out: moves the row to ARCHIVED and stamps `removedAt`.
 *
 * ARCHIVED rather than REJECTED because REJECTED means "a moderator turned this down" --
 * see the schema comment on `removedAt`. Because ARCHIVED is simply not PUBLISHED, every
 * existing read path drops the row with no query change: the public list and count, the
 * visibility gate, all three _count.references card counts, and the PUBLISHED guard that
 * stops any further ContactRequest being created against it.
 *
 * Idempotent, and safe against a link shared or prefetched twice: the `removedAt: null`
 * in the where-clause means a second call matches nothing and reports `alreadyRemoved`
 * rather than re-stamping or erroring. Retain-never-delete -- the row itself survives, so
 * an admin can still see that this reference existed and that its owner removed it.
 */
export async function removeReferenceByToken(
  token: string
): Promise<{ ok: boolean; alreadyRemoved: boolean }> {
  const result = await emptyIfColumnMissing(
    () =>
      prisma.reference.updateMany({
        where: { removalToken: token, removedAt: null },
        data: { status: "ARCHIVED", removedAt: new Date() },
      }),
    { count: 0 }
  );
  if (result.count > 0) return { ok: true, alreadyRemoved: false };

  // Nothing matched: either the token is unknown, or it was already used. Distinguish the
  // two so the page can say "already removed" instead of "link not found" -- being told
  // your removal link is invalid, when it worked, is the one message guaranteed to alarm.
  const existing = await getReferenceByRemovalToken(token);
  return { ok: Boolean(existing), alreadyRemoved: Boolean(existing) };
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

/** Wrapped because `include` selects every scalar on Reference, including the columns the
 * removal-token migration adds -- so this is one of the reads that would P2022 if code
 * landed first. It backs the /admin queue, where an empty list is recoverable and a 500
 * is not. */
export async function listPendingReferences() {
  return emptyIfColumnMissing(
    () =>
      prisma.reference.findMany({
        where: { status: "PENDING" },
        include: { program: { select: { name: true, slug: true } } },
        orderBy: { createdAt: "asc" },
      }),
    []
  );
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
  // Same `include`-selects-every-scalar reasoning as listPendingReferences above.
  const references = await emptyIfColumnMissing(
    () =>
      prisma.reference.findMany({
        include: {
          program: { select: { name: true, slug: true } },
          _count: { select: { contactRequests: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    []
  );
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
