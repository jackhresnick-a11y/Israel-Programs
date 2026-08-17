/**
 * Pure, client-safe module for the static type/location landing pages
 * (/programs/location/[location], /programs/type/[programType]/location/[location]).
 * No lib/prisma import -- same split-for-client-components precedent as
 * lib/glossaryContent.ts vs lib/glossary.ts, lib/tagTints.ts vs lib/tags.ts.
 *
 * "Location" here means the `location`-category Tag rows, not Program.location --
 * Program.location is 300+ distinct freeform strings (street addresses, multi-city
 * descriptions) and is unusable as a facet; the curated location tags are what the
 * browse filter bar already uses. "Type" means the `program-type` TagCategory. Neither
 * list here is data queried live -- it's the fixed taxonomy both facets are drawn from;
 * lib/locationPages.ts's listLocationRoutes() is what decides, from live published-
 * program counts, which combinations actually get a route.
 */
import { z } from "zod";

export const MIN_PROGRAMS_PER_PAGE = 4;

/** The one place the "does this page get a route" boundary is expressed -- used by
 * lib/locationPages.ts's fetchLocationRoutes so the threshold check is unit-testable
 * without a database. */
export function meetsThreshold(count: number): boolean {
  return count >= MIN_PROGRAMS_PER_PAGE;
}

export type LocationFacet = {
  slug: string;
  label: string;
  /** Tag slugs this facet's page filters on -- more than one when a low-volume tag is
   * folded into a broader one (see coastal-israel below). Always OR'd together, matching
   * the "location" category's OR-within-category semantics in buildTagAndClauses. */
  tagSlugs: string[];
};

export type TypeFacet = {
  slug: string;
  label: string;
  pluralLabel: string;
  tagSlugs: string[];
};

// The five live `location`-category Tag slugs (see prisma/merge-duplicate-tags.ts),
// plus the one-program `ramat-hasharon` tag folded into `coastal-israel` rather than
// given its own page -- the live `coast` Region row already groups them
// (memberSlugs: ["coastal-israel", "ramat-hasharon"]), so this isn't a new grouping.
// Display labels are fixed here rather than by editing the Tag rows themselves (some of
// which are inconsistently cased, e.g. tag "northern-israel" is named "northern israel").
export const LOCATION_FACETS: LocationFacet[] = [
  { slug: "jerusalem", label: "Jerusalem", tagSlugs: ["jerusalem"] },
  { slug: "northern-israel", label: "Northern Israel", tagSlugs: ["northern-israel"] },
  { slug: "coastal-israel", label: "Coastal Israel", tagSlugs: ["coastal-israel", "ramat-hasharon"] },
  { slug: "southern-israel", label: "Southern Israel", tagSlugs: ["southern-israel"] },
  { slug: "samaria", label: "Samaria", tagSlugs: ["samaria"] },
];

// The eight `program-type`-category Tag slugs (see prisma/seed-program-type-tags.ts).
// Four currently have zero published programs -- kept here anyway rather than pruned,
// since listLocationRoutes() already drops anything under MIN_PROGRAMS_PER_PAGE; a
// future tagging pass can make one of these routable with no code change.
export const TYPE_FACETS: TypeFacet[] = [
  {
    slug: "israeli-yeshiva",
    label: "Israeli Yeshiva",
    pluralLabel: "Israeli yeshivas",
    tagSlugs: ["israeli-yeshiva"],
  },
  {
    slug: "american-yeshiva",
    label: "American Yeshiva",
    pluralLabel: "American/English-language yeshivas",
    tagSlugs: ["american-yeshiva"],
  },
  {
    slug: "israeli-midrasha",
    label: "Israeli Midrasha",
    pluralLabel: "Israeli midrashot",
    tagSlugs: ["israeli-midrasha"],
  },
  {
    slug: "american-seminary",
    label: "American Seminary",
    pluralLabel: "American seminaries",
    tagSlugs: ["american-seminary"],
  },
  {
    slug: "religious-mechina",
    label: "Religious Mechina",
    pluralLabel: "Religious mechinas",
    tagSlugs: ["religious-mechina"],
  },
  {
    slug: "regular-mechina",
    label: "Mechina",
    pluralLabel: "Non-religious mechinas",
    tagSlugs: ["regular-mechina"],
  },
  {
    slug: "academic-college-credit",
    label: "Academic (College Credit)",
    pluralLabel: "Academic (college credit) programs",
    tagSlugs: ["academic-college-credit"],
  },
  {
    slug: "experience-travel",
    label: "Experience / Travel-Focused",
    pluralLabel: "Experience/travel-focused programs",
    tagSlugs: ["experience-travel"],
  },
];

export function findLocationFacet(slug: string): LocationFacet | undefined {
  return LOCATION_FACETS.find((f) => f.slug === slug);
}

export function findTypeFacet(slug: string): TypeFacet | undefined {
  return TYPE_FACETS.find((f) => f.slug === slug);
}

/** The single definition of a page's program filter -- shared by the page body's
 * program query, the "open in filters" link, and app/programs/page.tsx's canonical-URL
 * mapping, so those three can never disagree about what a given route means. */
export function filterTagsFor(typeSlug: string | null, locationSlug: string): string[] | null {
  const location = findLocationFacet(locationSlug);
  if (!location) return null;
  if (typeSlug === null) return [...location.tagSlugs];
  const type = findTypeFacet(typeSlug);
  if (!type) return null;
  return [...location.tagSlugs, ...type.tagSlugs];
}

export function canonicalPathFor(typeSlug: string | null, locationSlug: string): string {
  return typeSlug === null
    ? `/programs/location/${locationSlug}`
    : `/programs/type/${typeSlug}/location/${locationSlug}`;
}

function titleFor(typeSlug: string | null, locationSlug: string): string {
  const location = findLocationFacet(locationSlug);
  const locationLabel = location?.label ?? locationSlug;
  if (typeSlug === null) return `Programs in ${locationLabel}`;
  const type = findTypeFacet(typeSlug);
  const typeLabel = type?.pluralLabel ?? typeSlug;
  return `${typeLabel} in ${locationLabel}`;
}

const locationPageCopySchema = z.object({
  intro: z.string().trim().min(1).max(2000),
});
export type LocationPageCopy = z.infer<typeof locationPageCopySchema>;

// Partial map keyed by the page's own canonical path -- an admin override only needs to
// supply the pages it wants to change; anything absent falls back to the generated
// placeholder below. See lib/locationPages.ts's parseLocationPagesCopy for the merge.
export const locationPagesCopySchema = z.record(z.string(), locationPageCopySchema);
export type LocationPagesCopyMap = z.infer<typeof locationPagesCopySchema>;

/** Generated placeholder intro -- clearly not final copy. Every generated route gets an
 * entry (built from the facets, not hand-written per page) so a page never ships with no
 * intro at all while this is still unwritten; lib/locationPages.ts's getLocationPageCopy
 * lets a "locationPages" SiteContent row override any of these per path with zero code
 * change, the same pattern lib/glossaryContent.ts's DEFAULT_GLOSSARY_ENTRIES uses. */
export function defaultIntroFor(typeSlug: string | null, locationSlug: string): string {
  const title = titleFor(typeSlug, locationSlug);
  return (
    `Placeholder intro -- to be written. ${title} on Israel Programs Wiki: browse the ` +
    `full list below, or open this search in the filter bar for more options.`
  );
}

export function defaultCopyFor(typeSlug: string | null, locationSlug: string): LocationPageCopy {
  return { intro: defaultIntroFor(typeSlug, locationSlug) };
}
