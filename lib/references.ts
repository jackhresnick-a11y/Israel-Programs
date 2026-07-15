import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { optionalWhatsappNumberSchema } from "@/lib/phone";

export const referenceInputSchema = z.object({
  attendedText: z.string().trim().min(1, "Let people know roughly when you attended").max(200),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
  whatsappNumber: optionalWhatsappNumberSchema,
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
    },
  });
}

/**
 * Deliberately selects only the fields the public program page may render.
 * contactEmail/userId/whatsappNumber/whatsappNumberSource must never reach a
 * client component's props, since Next.js serializes client-component props
 * into the page's RSC payload -- present in the raw HTML even for fields the
 * JSX never displays.
 */
export async function listPublishedReferences(programId: string) {
  return prisma.reference.findMany({
    where: { programId, status: "PUBLISHED" },
    select: { id: true, displayName: true, attendedText: true, note: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listPendingReferences() {
  return prisma.reference.findMany({
    where: { status: "PENDING" },
    include: { program: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Admin-only: every reference regardless of status, including contactEmail
 * and whatsappNumber. Only ever consumed by the admin references page --
 * never pass the result of this to a client component wholesale.
 */
export async function listAllReferencesForAdmin() {
  return prisma.reference.findMany({
    include: { program: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });
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

export async function approveReference(id: string) {
  return prisma.reference.update({ where: { id }, data: { status: "PUBLISHED" } });
}

export async function rejectReference(id: string) {
  return prisma.reference.update({ where: { id }, data: { status: "REJECTED" } });
}

export async function deleteReference(id: string) {
  return prisma.reference.delete({ where: { id } });
}

export const contactRequestInputSchema = z.object({
  note: z.string().trim().min(1, "Add a short note about why you're reaching out").max(1000),
});

export type ContactRequestInput = z.infer<typeof contactRequestInputSchema>;

export async function createContactRequest(
  referenceId: string,
  input: ContactRequestInput,
  requester: { userId: string; email: string }
) {
  return prisma.contactRequest.create({
    data: {
      referenceId,
      requesterUserId: requester.userId,
      requesterEmail: requester.email,
      note: input.note,
      status: "OPEN",
    },
  });
}

/** All contact requests for references the given user owns, across every program. */
export async function listContactRequestsForUser(userId: string) {
  return prisma.contactRequest.findMany({
    where: { reference: { userId } },
    include: { reference: { include: { program: { select: { name: true, slug: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Returns null if the request doesn't exist or isn't owned by userId, otherwise the updated row. */
export async function markContactRequestReplied(id: string, userId: string) {
  const request = await prisma.contactRequest.findUnique({
    where: { id },
    include: { reference: { select: { userId: true } } },
  });
  if (!request || request.reference.userId !== userId) return null;

  return prisma.contactRequest.update({ where: { id }, data: { status: "REPLIED" } });
}
