import type { MetadataRoute } from "next";
import { listPublishedProgramSlugsForSitemap } from "@/lib/programs";
import { getGlossaryEntries } from "@/lib/glossary";
import { SITE_URL } from "@/lib/siteUrl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [programs, glossaryEntries] = await Promise.all([
    listPublishedProgramSlugsForSitemap(),
    getGlossaryEntries(),
  ]);

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
    {
      url: `${SITE_URL}/glossary`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...glossaryEntries.map((entry) => ({
      url: `${SITE_URL}/glossary/${entry.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...programs.map((program) => ({
      url: `${SITE_URL}/programs/${program.slug}`,
      lastModified: program.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
