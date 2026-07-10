import { prisma } from "@/lib/prisma";
import { EmailVerificationStatus } from "@/app/generated/prisma/client";

/**
 * How long a VERIFIED status is trusted before the program re-enters the
 * queue. Staleness is computed at query time from this single constant --
 * there's no stored "stale" flag and nothing to drift -- and the public
 * display check (app/programs/[slug]/page.tsx) imports the same constant so
 * the queue and the site can't disagree about what counts as stale.
 */
export const STALE_AFTER_MONTHS = 18;

function staleCutoff(): Date {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - STALE_AFTER_MONTHS);
  return cutoff;
}

/** Shared by the public program page so "verified" display and queue re-entry can't disagree. */
export function isEmailVerificationFresh(verifiedAt: Date | null): boolean {
  if (!verifiedAt) return false;
  return verifiedAt >= staleCutoff();
}

export type EmailVerificationQueueRow = {
  id: string;
  name: string;
  slug: string;
  contactEmail: string;
  contactEmailSource: string | null;
  contactEmailStatus: EmailVerificationStatus | null;
  contactEmailVerifiedAt: Date | null;
};

/**
 * Every program with a contactEmail that has never been checked, plus any
 * VERIFIED program whose check has gone stale. Ordered by Program.createdAt
 * ascending -- the closest honest proxy for "oldest first" available, since
 * there's no separate "email added at" timestamp (imports and edits only
 * bump Program.updatedAt).
 */
export async function listEmailVerificationQueue(): Promise<EmailVerificationQueueRow[]> {
  const rows = await prisma.program.findMany({
    where: {
      contactEmail: { not: null },
      OR: [
        { contactEmailStatus: null },
        { contactEmailStatus: "VERIFIED", contactEmailVerifiedAt: { lt: staleCutoff() } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      contactEmail: true,
      contactEmailSource: true,
      contactEmailStatus: true,
      contactEmailVerifiedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.filter((r): r is EmailVerificationQueueRow => r.contactEmail !== null);
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Builds the queue CSV fresh, in memory, from the live queue -- no file ever touches disk. */
export async function generateEmailVerificationQueueCsv(): Promise<string> {
  const rows = await listEmailVerificationQueue();
  const header = ["Program Name", "Email", "Source URL"].join(",");
  const lines = rows.map((r) =>
    [csvField(r.name), csvField(r.contactEmail), csvField(r.contactEmailSource ?? "")].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

/**
 * Records a human verification outcome: updates the Program's current
 * status fields and appends an immutable audit row in one transaction.
 * VERIFIED sets contactEmailVerifiedAt; BOUNCED/WRONG_CONTACT leave it null
 * (and leave contactEmail in place -- nothing is deleted, the address and the
 * reason both survive in the audit table until a human replaces it via the
 * normal edit flow). Throws if the program has no contactEmail to verify.
 */
export async function recordEmailVerification(
  programId: string,
  status: EmailVerificationStatus,
  checkedById: string,
  note?: string,
) {
  const program = await prisma.program.findUniqueOrThrow({
    where: { id: programId },
    select: { contactEmail: true },
  });
  if (!program.contactEmail) {
    throw new Error("Program has no contactEmail to verify");
  }

  const email = program.contactEmail;

  await prisma.$transaction([
    prisma.program.update({
      where: { id: programId },
      data: {
        contactEmailStatus: status,
        contactEmailVerifiedAt: status === "VERIFIED" ? new Date() : null,
      },
    }),
    prisma.contactEmailVerification.create({
      data: { programId, email, status, note: note?.trim() || null, checkedById },
    }),
  ]);
}
