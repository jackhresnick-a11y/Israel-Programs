/**
 * Server-side reads for the static type/location landing pages. Split from
 * lib/locationPagesContent.ts (the pure/client-safe half) per the lib/glossary.ts vs
 * lib/glossaryContent.ts precedent -- this file imports lib/prisma.ts, which pulls in
 * `pg`, so it must never be imported by a "use client" component.
 */
import { unstable_cache } from "next/cache";
import type { DurationType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSiteContent } from "@/lib/siteContent";
import { listPrograms } from "@/lib/programs";
import { getDurationLabelMap } from "@/lib/duration";
import {
  LOCATION_FACETS,
  TYPE_FACETS,
  MIN_PROGRAMS_PER_PAGE,
  meetsThreshold,
  findLocationFacet,
  findTypeFacet,
  filterTagsFor,
  canonicalPathFor,
  defaultCopyFor,
  locationPagesCopySchema,
  type LocationPageCopy,
  type LocationPagesCopyMap,
} from "@/lib/locationPagesContent";

export {
  MIN_PROGRAMS_PER_PAGE,
  LOCATION_FACETS,
  TYPE_FACETS,
  findLocationFacet,
  findTypeFacet,
  filterTagsFor,
  canonicalPathFor,
  type LocationFacet,
  type TypeFacet,
} from "@/lib/locationPagesContent";

const LOCATION_PAGES_COPY_KEY = "locationPages";

async function fetchLocationPagesCopyOverrides(): Promise<LocationPagesCopyMap> {
  const raw = await getSiteContent(LOCATION_PAGES_COPY_KEY);
  if (!raw) return {};
  try {
    return locationPagesCopySchema.parse(JSON.parse(raw));
  } catch {
    // Malformed/partial SiteContent row -- degrade to the generated placeholder rather
    // than failing a static page's build/render.
    return {};
  }
}

/** Intro copy for one page, keyed by its own canonical path. Falls back to the generated
 * placeholder (lib/locationPagesContent.ts's defaultCopyFor) for any path an admin
 * hasn't overridden in the "locationPages" SiteContent row yet -- same override-with-
 * zero-code-change pattern as lib/glossary.ts's getGlossaryEntries. */
export async function getLocationPageCopy(
  typeSlug: string | null,
  locationSlug: string
): Promise<LocationPageCopy> {
  const overrides = await fetchLocationPagesCopyOverrides();
  const path = canonicalPathFor(typeSlug, locationSlug);
  return overrides[path] ?? defaultCopyFor(typeSlug, locationSlug);
}

export type LocationRoute = { typeSlug: string | null; locationSlug: string; count: number };

/** Every (type, location) combination -- including the location-only "no type" case --
 * with its live PUBLISHED program count, filtered to MIN_PROGRAMS_PER_PAGE or more. This
 * is the single source of truth for which static routes exist: generateStaticParams for
 * both route trees, the sitemap, and app/programs/page.tsx's canonical-URL mapping all
 * call this rather than re-deriving the threshold themselves, so a route can never be
 * listed as canonical/sitemapped without also being statically generated (or vice
 * versa).
 *
 * Uses prisma.program.count with an explicit two-clause AND (location tags, then type
 * tags) rather than routing through lib/programs.ts's listPrograms -- by construction
 * every LOCATION_FACETS entry's tagSlugs share the "location" Tag category and every
 * TYPE_FACETS entry's tagSlugs share "program-type", so this two-clause AND is exactly
 * buildTagAndClauses' per-category grouping for this specific slug set, at a fraction of
 * the DB transfer cost of fetching full program rows for all ~45 combinations on every
 * build.
 */
async function fetchLocationRoutes(): Promise<LocationRoute[]> {
  const combos: { typeSlug: string | null; locationSlug: string }[] = [];
  for (const location of LOCATION_FACETS) {
    combos.push({ typeSlug: null, locationSlug: location.slug });
    for (const type of TYPE_FACETS) {
      combos.push({ typeSlug: type.slug, locationSlug: location.slug });
    }
  }

  const counted = await Promise.all(
    combos.map(async ({ typeSlug, locationSlug }) => {
      const location = findLocationFacet(locationSlug);
      const type = typeSlug ? findTypeFacet(typeSlug) : null;
      if (!location || (typeSlug && !type)) return { typeSlug, locationSlug, count: 0 };
      const count = await prisma.program.count({
        where: {
          status: "PUBLISHED",
          AND: [
            { tags: { some: { slug: { in: location.tagSlugs } } } },
            ...(type ? [{ tags: { some: { slug: { in: type.tagSlugs } } } }] : []),
          ],
        },
      });
      return { typeSlug, locationSlug, count };
    })
  );

  return counted.filter((route) => meetsThreshold(route.count));
}

// Cached rather than tag-invalidated on program/tag writes -- this taxonomy changes
// rarely (an admin retagging pass, not a per-program edit), and every consumer (both
// route trees' generateStaticParams, the sitemap, and /programs' generateMetadata) is
// fine reading up to an hour stale, matching the landing pages' own `revalidate = 3600`.
export const listLocationRoutes = unstable_cache(fetchLocationRoutes, ["location-routes"], {
  tags: ["location-pages"],
  revalidate: 3600,
});

export async function isLiveRoute(typeSlug: string | null, locationSlug: string): Promise<boolean> {
  const routes = await listLocationRoutes();
  return routes.some((r) => r.typeSlug === typeSlug && r.locationSlug === locationSlug);
}

/** Looks up the live route (if any) whose exact tag set matches `tagSlugs` -- used by
 * app/programs/page.tsx's generateMetadata to decide whether a `?tags=...` URL should
 * canonicalize to a static page. Order-independent; matches only on an exact set (a
 * request with extra tags beyond one route's set keeps the default "/programs"
 * canonical, it does not partially match). */
export async function findRouteByTagSet(tagSlugs: string[]): Promise<LocationRoute | null> {
  const requested = new Set(tagSlugs);
  if (requested.size === 0) return null;
  const routes = await listLocationRoutes();
  for (const route of routes) {
    const routeTags = filterTagsFor(route.typeSlug, route.locationSlug);
    if (!routeTags) continue;
    const routeSet = new Set(routeTags);
    if (routeSet.size !== requested.size) continue;
    if ([...routeSet].every((slug) => requested.has(slug))) return route;
  }
  return null;
}

export type LocationPageContextTag = { category: string; slug: string; name: string; count: number };

/** Per-page "what's typical here" breakdown -- the dominant affiliation/age/essence tag
 * (by count) among this page's own matched programs, plus the duration mix. Computed
 * from the already-fetched program list (no extra query), and genuinely different per
 * page since it depends on which programs matched. Location/program-type categories are
 * excluded -- every program on the page already shares those by definition, so surfacing
 * them again would be redundant with the page's own header. */
function computeContextBreakdown(
  programs: { tags: { slug: string; name: string; category: string | null }[]; durationType: DurationType }[]
): { topTags: LocationPageContextTag[]; durationCounts: Partial<Record<DurationType, number>> } {
  const byCategory = new Map<string, Map<string, { name: string; count: number }>>();
  for (const program of programs) {
    for (const tag of program.tags) {
      if (!tag.category || tag.category === "location" || tag.category === "program-type") continue;
      let bucket = byCategory.get(tag.category);
      if (!bucket) {
        bucket = new Map();
        byCategory.set(tag.category, bucket);
      }
      const entry = bucket.get(tag.slug) ?? { name: tag.name, count: 0 };
      entry.count += 1;
      bucket.set(tag.slug, entry);
    }
  }

  const topTags: LocationPageContextTag[] = [];
  for (const [category, bucket] of byCategory) {
    const [topSlug, top] = [...bucket.entries()].sort((a, b) => b[1].count - a[1].count)[0] ?? [];
    if (topSlug && top) topTags.push({ category, slug: topSlug, name: top.name, count: top.count });
  }

  const durationCounts: Partial<Record<DurationType, number>> = {};
  for (const program of programs) {
    durationCounts[program.durationType] = (durationCounts[program.durationType] ?? 0) + 1;
  }

  return { topTags, durationCounts };
}

export type LocationPageData = Awaited<ReturnType<typeof getLocationPageData>>;

/** Full render payload for one landing page. Returns null when the combination doesn't
 * resolve to a real facet pair or (defensively -- listLocationRoutes should already have
 * filtered this at generateStaticParams time) no longer clears the threshold, so route
 * handlers can notFound() rather than rendering a thin page. */
export async function getLocationPageData(typeSlug: string | null, locationSlug: string) {
  const tags = filterTagsFor(typeSlug, locationSlug);
  if (!tags) return null;

  const [programs, durationLabelMap, copy] = await Promise.all([
    listPrograms({ tags }),
    getDurationLabelMap(),
    getLocationPageCopy(typeSlug, locationSlug),
  ]);

  if (programs.length < MIN_PROGRAMS_PER_PAGE) return null;

  const location = findLocationFacet(locationSlug)!;
  const type = typeSlug ? findTypeFacet(typeSlug) : null;
  const { topTags, durationCounts } = computeContextBreakdown(programs);

  return {
    location,
    type,
    programs,
    durationLabelMap,
    copy,
    topTags,
    durationCounts,
    filterHref: `/programs?tags=${tags.join(",")}`,
  };
}
