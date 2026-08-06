import type { MetadataRoute } from "next";
import { listPublishedProgramSlugsForSitemap } from "@/lib/programs";
import { SITE_URL } from "@/lib/siteUrl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const programs = await listPublishedProgramSlugsForSitemap();

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
    ...programs.map((program) => ({
      url: `${SITE_URL}/programs/${program.slug}`,
      lastModified: program.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
