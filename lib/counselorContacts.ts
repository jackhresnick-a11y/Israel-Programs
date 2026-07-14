import { prisma } from "@/lib/prisma";
import { CounselorOutreachStatus, SchoolSize } from "@/app/generated/prisma/client";

export type CounselorContactInput = {
  schoolName: string;
  country: string;
  cityRegion: string;
  schoolSize?: SchoolSize | null;
  contactName?: string | null;
  email: string;
  emailIsGeneric?: boolean;
  sourceUrl: string;
  notes?: string | null;
};

export async function listCounselorContacts(filters?: { country?: string; status?: CounselorOutreachStatus }) {
  return prisma.counselorContact.findMany({
    where: {
      ...(filters?.country ? { country: filters.country } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: [{ country: "asc" }, { schoolName: "asc" }],
  });
}

export async function getCounselorContact(id: string) {
  return prisma.counselorContact.findUnique({ where: { id } });
}

export async function createCounselorContact(input: CounselorContactInput) {
  return prisma.counselorContact.create({ data: input });
}

/**
 * Updating email resets status to NOT_CONTACTED -- a changed address's outreach
 * history no longer applies, same rule as Program.contactEmailStatus being reset
 * when contactEmail changes (lib/programs.ts / lib/programEdits.ts).
 */
export async function updateCounselorContact(id: string, input: Partial<CounselorContactInput>) {
  const data: Partial<CounselorContactInput> & { status?: CounselorOutreachStatus } = { ...input };
  if (input.email !== undefined) {
    const existing = await prisma.counselorContact.findUniqueOrThrow({ where: { id }, select: { email: true } });
    if (input.email !== existing.email) {
      data.status = "NOT_CONTACTED";
    }
  }
  return prisma.counselorContact.update({ where: { id }, data });
}

export async function deleteCounselorContact(id: string) {
  return prisma.counselorContact.delete({ where: { id } });
}

/**
 * Records an outreach status change: updates the contact's current status and
 * appends an immutable audit row in one transaction, mirroring
 * lib/emailVerification.ts's recordEmailVerification.
 */
export async function recordCounselorOutreach(
  id: string,
  status: CounselorOutreachStatus,
  recordedById: string,
  note?: string,
) {
  const contact = await prisma.counselorContact.findUniqueOrThrow({ where: { id }, select: { email: true } });

  await prisma.$transaction([
    prisma.counselorContact.update({ where: { id }, data: { status } }),
    prisma.counselorContactEvent.create({
      data: { contactId: id, email: contact.email, status, note: note?.trim() || null, recordedById },
    }),
  ]);
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Builds the contacts CSV fresh, in memory, from the live table -- no file ever touches disk. */
export async function generateCounselorContactsCsv(): Promise<string> {
  const rows = await listCounselorContacts();
  const header = [
    "School Name",
    "Country",
    "City/Region",
    "School Size",
    "Contact Name",
    "Email",
    "Generic Email",
    "Source URL",
    "Status",
    "Notes",
  ].join(",");
  const lines = rows.map((r) =>
    [
      csvField(r.schoolName),
      csvField(r.country),
      csvField(r.cityRegion),
      csvField(r.schoolSize ?? ""),
      csvField(r.contactName ?? ""),
      csvField(r.email),
      csvField(r.emailIsGeneric ? "Yes" : "No"),
      csvField(r.sourceUrl),
      csvField(r.status),
      csvField(r.notes ?? ""),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}
