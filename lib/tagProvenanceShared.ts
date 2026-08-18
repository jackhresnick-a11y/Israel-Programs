/**
 * Pure logic behind per-tag provenance -- split out (no Prisma import) so
 * components/admin/ProgramsAdminManager.tsx ("use client") can validate/label without
 * pulling in lib/tagProvenance.ts, which imports lib/prisma.ts -> `pg`. Same split-for-
 * client-components precedent as lib/tagTints.ts/lib/pollShared.ts/lib/finderTargets.ts.
 */
import { z } from "zod";
import { TagProvenanceSource } from "@/app/generated/prisma/enums";

export { TagProvenanceSource };

/** Ordered for the admin `<select>` -- UNKNOWN last since it's the default/absent state,
 *  never a value an admin should deliberately choose over a real answer. */
export const TAG_PROVENANCE_SOURCES: TagProvenanceSource[] = [
  "OFFICIAL_SITE",
  "POLL_DERIVED",
  "ADMIN_ASSERTED",
  "INFERRED",
  "UNKNOWN",
];

export const TAG_PROVENANCE_SOURCE_LABELS: Record<TagProvenanceSource, string> = {
  OFFICIAL_SITE: "Observed on official site",
  POLL_DERIVED: "Derived from poll data",
  ADMIN_ASSERTED: "Admin-asserted",
  INFERRED: "Inferred",
  UNKNOWN: "Unknown",
};

/** The one place "what is this pair's source" gets resolved -- a missing row and a row
 *  explicitly holding `source: UNKNOWN` must render identically everywhere, since there
 *  is no backfill and absence of a row IS the UNKNOWN state (see
 *  ProgramTagProvenance's schema doc comment). Never inline `row?.source ?? "UNKNOWN"`
 *  at a call site instead of calling this. */
export function resolveSource(row: { source: TagProvenanceSource } | null | undefined): TagProvenanceSource {
  return row?.source ?? "UNKNOWN";
}

/** zod's .url() accepts any scheme (javascript:, data:, ...); this restricts to http/https,
 *  same discipline as lib/programs.ts's httpUrl (duplicated rather than imported -- that
 *  module pulls in lib/prisma.ts -> `pg`, which this file must stay free of). */
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), { message: "Must be a valid http(s) URL" });

export const tagProvenanceInputSchema = z.object({
  tagId: z.string().trim().min(1),
  source: z.enum(TAG_PROVENANCE_SOURCES as [TagProvenanceSource, ...TagProvenanceSource[]]),
  sourceUrl: httpUrl.optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type TagProvenanceInput = z.infer<typeof tagProvenanceInputSchema>;

/** Sitewide backlog count: how many of a program's currently-attached tags have no
 *  provenance row at all. `provenanceTagIds` is the set of tagIds this program already
 *  has a ProgramTagProvenance row for (any source, including an explicit UNKNOWN --
 *  a deliberate UNKNOWN row still counts as "worked", just recorded honestly). */
export function countUnprovenancedTags(
  programTagIds: string[],
  provenanceTagIds: Set<string> | string[]
): number {
  const provenanced = provenanceTagIds instanceof Set ? provenanceTagIds : new Set(provenanceTagIds);
  return programTagIds.filter((tagId) => !provenanced.has(tagId)).length;
}
