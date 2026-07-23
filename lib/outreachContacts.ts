import programContacts from "@/data/program-contacts.json";

/** One row of the manual outreach-contacts research pass -- publicly listed
 * institutional contact info pulled from each program's own website (never a
 * third-party aggregator, never a personal address). Deliberately NOT tied to
 * Program.contactEmail/contactPhone: this is the site owner's own outreach list, not
 * app data -- see research/program-contacts.csv (the source of truth this file
 * mirrors) and its accompanying research notes for provenance/methodology. */
type ProgramContactRow = {
  id: string;
  name: string;
  email: string;
  admissionsContact: string;
  phone: string;
  contactPageUrl: string;
  notFound: string;
};

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Builds the outreach-contacts CSV from the static research/program-contacts.json
 * snapshot (imported as a module, not read from disk at request time -- Vercel's
 * serverless functions only reliably see files that are actually bundled, and a
 * runtime fs read of an arbitrary repo path isn't guaranteed to survive Next's output
 * file tracing; a normal import always does). Not database-backed on purpose. */
export function generateOutreachContactsCsv(): string {
  const rows = programContacts as ProgramContactRow[];
  const header = ["id", "name", "email", "admissionsContact", "phone", "contactPageUrl", "notFound"].join(",");
  const lines = rows.map((r) =>
    [
      csvField(r.id),
      csvField(r.name),
      csvField(r.email),
      csvField(r.admissionsContact),
      csvField(r.phone),
      csvField(r.contactPageUrl),
      csvField(r.notFound),
    ].join(",")
  );
  return [header, ...lines].join("\n");
}
