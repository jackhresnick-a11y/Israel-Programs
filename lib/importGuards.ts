/**
 * Program.contactEmail and contactEmailSource are owned exclusively by the
 * contact-verification workflow (lib/emailVerification.ts) -- batch/research import and
 * seed code must never populate them, since an address written at import time has no
 * human verification and no recorded provenance (see the 2026-07-10 remediation: 130 of
 * 209 non-null contactEmail rows had no contactEmailSource at all, traced to
 * prisma/seed.ts and prisma/import-researched.ts both writing contactEmail directly).
 * Call this immediately before every prisma.program.create/upsert invoked from
 * import/seed code, passing the exact data object about to be written -- this is a
 * runtime backstop that fires even if a future edit bypasses whatever compile-time type
 * no longer has the field (e.g. a spread from an object literal that still includes it).
 */
export function assertNoImportedContactFields(data: Record<string, unknown>): void {
  if ("contactEmail" in data || "contactEmailSource" in data) {
    throw new Error(
      "Import/seed code attempted to write contactEmail/contactEmailSource -- these fields " +
        "are owned exclusively by the contact-verification workflow. Route researched " +
        "emails through that workflow instead of program import."
    );
  }
}
