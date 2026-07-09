import slugify from "slugify";
import { prisma } from "@/lib/prisma";

// Seed defaults for prisma/seed-duration-region.ts. Once seeded, admin-editable Region
// rows (see below) are the source of truth -- SearchBar receives them as a prop from its
// server parent rather than importing these constants directly, which is what makes it
// safe for this file to import lib/prisma (a server-only module).
export const REGION_ORDER = ["north", "south", "jerusalem", "judea", "samaria", "coast"];

export const REGION_LABELS: Record<string, string> = {
  north: "North",
  south: "South",
  jerusalem: "Jerusalem",
  judea: "Judea",
  samaria: "Samaria",
  coast: "Coast",
};

// Region -> member location-tag slugs, as originally hardcoded. Edit prisma/seed-*.ts
// or the admin UI (app/admin/tags), not these constants, to change a live region's
// membership -- these only matter the first time a Region row is seeded.
export const REGION_TO_SLUGS: Record<string, string[]> = {
  north: ["haifa", "tzfat"],
  south: ["negev", "beer-sheva", "arava-valley", "south"],
  jerusalem: ["jerusalem", "old-city", "old-city-jerusalem"],
  judea: ["gush-etzion", "hebron"],
  samaria: ["eli", "ariel", "shiloh"],
  coast: ["tel-aviv", "herzliya", "ramat-hasharon", "hod-hasharon", "modiin"],
};

function slugifyValue(value: string) {
  return slugify(value, { lower: true, strict: true });
}

export async function listRegions() {
  return prisma.region.findMany({ orderBy: { order: "asc" } });
}

export async function createRegion(input: { label: string; memberSlugs: string[] }) {
  const slug = slugifyValue(input.label);
  const maxOrder = await prisma.region.aggregate({ _max: { order: true } });
  return prisma.region.create({
    data: {
      slug,
      label: input.label,
      memberSlugs: input.memberSlugs,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

/** Renaming a region does not change its slug -- same principle as TagCategory (see
 * lib/tags.ts's updateTagCategory), slug is a stable identity assigned at creation, not
 * derived from the current label. */
export async function updateRegion(
  id: string,
  input: Partial<{ label: string; order: number; memberSlugs: string[] }>
) {
  return prisma.region.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.memberSlugs !== undefined ? { memberSlugs: input.memberSlugs } : {}),
    },
  });
}

export async function deleteRegion(id: string) {
  return prisma.region.delete({ where: { id } });
}
