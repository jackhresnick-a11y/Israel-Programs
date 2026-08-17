import type { MetadataRoute } from "next";
import { listPublishedProgramSlugsForSitemap } from "@/lib/programs";
import { getPublishedGlossaryEntries } from "@/lib/glossary";
import { listLocationRoutes } from "@/lib/locationPages";
import { canonicalPathFor } from "@/lib/locationPagesContent";
import { getSiteContent } from "@/lib/siteContent";
import { SITE_URL } from "@/lib/siteUrl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [programs, glossaryFlag, locationRoutes] = await Promise.all([
    listPublishedProgramSlugsForSitemap(),
    getSiteContent("glossaryEnabled"),
    listLocationRoutes(),
  ]);
  // Crawled anonymously -- reflects public-visible state only, no admin bypass. When
  // the section is globally off, every glossary URL (index + entries) is omitted
  // outright rather than left in with a 404 behind it.
  const glossaryEntries = glossaryFlag === "true" ? await getPublishedGlossaryEntries() : [];

  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/programs`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/mission`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/methodology`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    ...(glossaryFlag === "true"
      ? [
          {
            url: `${SITE_URL}/glossary`,
            changeFrequency: "monthly" as const,
            priority: 0.6,
          },
          ...glossaryEntries.map((entry) => ({
            url: `${SITE_URL}/glossary/${entry.slug}`,
            changeFrequency: "monthly" as const,
            priority: 0.5,
          })),
        ]
      : []),
    ...programs.map((program) => ({
      url: `${SITE_URL}/programs/${program.slug}`,
      lastModified: program.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    // Static type/location landing pages -- only routes that actually clear
    // MIN_PROGRAMS_PER_PAGE (see lib/locationPages.ts) are listed here, matching exactly
    // what generateStaticParams prerenders for both route trees below. The equivalent
    // `?tags=...` parameter URLs are deliberately never included -- they carry a
    // canonical tag pointing at these instead (see app/programs/page.tsx).
    ...locationRoutes.map((route) => ({
      url: `${SITE_URL}${canonicalPathFor(route.typeSlug, route.locationSlug)}`,
      changeFrequency: "weekly" as const,
      priority: route.typeSlug === null ? 0.8 : 0.7,
    })),
  ];
}
