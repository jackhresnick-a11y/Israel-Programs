/**
 * Pure row-building logic shared between scripts/export-tag-audit.ts (writes a file to
 * disk) and the admin CSV-download route (returns the same bytes over HTTP, no
 * filesystem access -- this module has none). See export-tag-audit.ts's header comment
 * for the full NONE-sentinel / pre-fill rationale; scripts/import-tag-audit.ts is the
 * consumer these rows must stay byte-compatible with, via AUDIT_CSV_HEADER's exact
 * column names.
 */
import type { DurationType } from "@/app/generated/prisma/enums";

const LISTING_BASE_URL = "https://israelprogramswiki.com/programs";

// Written into proposed_type/proposed_essence in place of "" when a program has no
// current tags in that category. scripts/import-tag-audit.ts recognizes this same string.
export const NONE_SENTINEL = "NONE";

export const FAMILY = {
  type: "program-type",
  essence: "essence",
  gender: "gender",
  affiliation: "affiliation",
  integration: "israeli-integration",
  location: "location",
} as const;

export const AUDIT_CSV_HEADER = [
  "id",
  "name",
  "slug",
  "url",
  "current_type",
  "current_essence",
  "current_duration",
  "current_gender",
  "current_religious_affiliation",
  "current_israeli_integration",
  "current_region",
  "proposed_type",
  "proposed_essence",
  "reviewer",
  "notes",
] as const;

export type AuditRow = Record<(typeof AUDIT_CSV_HEADER)[number], string>;

export type AuditProgram = {
  id: string;
  name: string;
  slug: string;
  durationType: DurationType;
  tags: { slug: string; category: string | null }[];
};

export type AuditRegion = { slug: string; memberSlugs: string[] };

export function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function slugsIn(tags: { slug: string; category: string | null }[], category: string): string {
  return tags
    .filter((t) => t.category === category)
    .map((t) => t.slug)
    .sort()
    .join("|");
}

export function buildAuditRow(
  program: AuditProgram,
  durationLabels: Record<DurationType, string>,
  regions: AuditRegion[]
): AuditRow {
  const locationSlugs = new Set(slugsIn(program.tags, FAMILY.location).split("|").filter(Boolean));
  const regionSlugs = regions
    .filter((r) => r.memberSlugs.some((s) => locationSlugs.has(s)))
    .map((r) => r.slug);
  const currentType = slugsIn(program.tags, FAMILY.type);
  const currentEssence = slugsIn(program.tags, FAMILY.essence);

  return {
    id: program.id,
    name: program.name,
    slug: program.slug,
    url: `${LISTING_BASE_URL}/${program.slug}`,
    current_type: currentType,
    current_essence: currentEssence,
    current_duration: durationLabels[program.durationType],
    current_gender: slugsIn(program.tags, FAMILY.gender),
    current_religious_affiliation: slugsIn(program.tags, FAMILY.affiliation),
    current_israeli_integration: slugsIn(program.tags, FAMILY.integration),
    current_region: regionSlugs.join("|"),
    // Pre-filled with the current value, not blank -- see export-tag-audit.ts's header
    // comment. A program with no current tags in the category gets the NONE sentinel
    // instead of "".
    proposed_type: currentType || NONE_SENTINEL,
    proposed_essence: currentEssence || NONE_SENTINEL,
    reviewer: "",
    notes: "",
  };
}

// Programs missing a type tag first, then alphabetical by name -- stable across runs.
export function compareAuditRows(a: AuditRow, b: AuditRow): number {
  const missingA = a.current_type === "" ? 0 : 1;
  const missingB = b.current_type === "" ? 0 : 1;
  if (missingA !== missingB) return missingA - missingB;
  return a.name.localeCompare(b.name);
}

export function renderAuditCsv(rows: AuditRow[]): string {
  const lines = rows.map((r) => AUDIT_CSV_HEADER.map((key) => csvField(r[key])).join(","));
  return [AUDIT_CSV_HEADER.join(","), ...lines].join("\n") + "\n";
}
