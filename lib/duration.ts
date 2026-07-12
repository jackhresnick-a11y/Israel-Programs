import type { DurationType } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

// Seed default + fallback for any DurationType value that hasn't been given a
// DurationOption row yet (see prisma/seed-duration-region.ts, which seeds one row per
// entry here). Every consumer that needs a duration label at render time should go
// through getDurationLabelMap() below rather than this map directly, so admin-edited
// labels (app/admin/tags) actually take effect. This file has no client-safe reason to
// be imported by a "use client" component anymore -- ProgramForm/EditReviewForm/SearchBar
// all receive the resolved label map / DurationOption rows as props from a server parent
// instead, which is what makes it safe to import lib/prisma (a server-only module) here.
export const DURATION_LABELS: Record<DurationType, string> = {
  TEN_DAY: "10-Day Trip",
  SHORT: "Short (2-10 weeks)",
  SUMMER: "Summer Program",
  SEMESTER: "Semester",
  GAP_YEAR: "Gap Year",
  MULTI_YEAR: "Multi-Year / Degree",
  ONGOING: "Ongoing / Flexible",
  CUSTOM: "Custom",
};

/** Synthesized fallback used only if the DurationOption table itself can't be read
 * (e.g. a DB enum value the deployed Prisma client doesn't know about yet -- see the
 * 2026-07-12 outage, where a committed-but-undeployed enum migration left prod's
 * client throwing P2023 on every page that read this table). Keeps the site degraded
 * -- default labels, CUSTOM hidden -- rather than fully down. */
function fallbackDurationOptions() {
  return (Object.keys(DURATION_LABELS) as DurationType[]).map((value, order) => ({
    id: `fallback-${value}`,
    value,
    label: DURATION_LABELS[value],
    order,
    showInFilter: value !== "CUSTOM",
  }));
}

export async function listDurationOptions() {
  try {
    return await prisma.durationOption.findMany({ orderBy: { order: "asc" } });
  } catch (err) {
    console.error("listDurationOptions: DurationOption table unreadable, using static fallback", err);
    return fallbackDurationOptions();
  }
}

export async function updateDurationOption(
  value: DurationType,
  input: Partial<{ label: string; order: number; showInFilter: boolean }>
) {
  return prisma.durationOption.update({
    where: { value },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.showInFilter !== undefined ? { showInFilter: input.showInFilter } : {}),
    },
  });
}

/** Merges already-fetched DurationOption rows onto DURATION_LABELS -- split out from
 * getDurationLabelMap so a caller that already has the rows in hand (e.g.
 * app/programs/page.tsx, which fetches listDurationOptions() for the filter bar
 * anyway) can build the label map without a second DB round trip. */
export function durationLabelMapFromOptions(
  rows: { value: DurationType; label: string }[]
): Record<DurationType, string> {
  const map = { ...DURATION_LABELS };
  for (const row of rows) {
    map[row.value] = row.label;
  }
  return map;
}

/** The single source of truth for how a duration should render anywhere in the app --
 * DB label where a DurationOption row exists, DURATION_LABELS as the fallback otherwise
 * (e.g. a DurationType value added to the enum before its row was seeded). */
export async function getDurationLabelMap(): Promise<Record<DurationType, string>> {
  try {
    const rows = await prisma.durationOption.findMany();
    return durationLabelMapFromOptions(rows);
  } catch (err) {
    console.error("getDurationLabelMap: DurationOption table unreadable, using static fallback", err);
    return { ...DURATION_LABELS };
  }
}
