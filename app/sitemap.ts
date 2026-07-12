import type { MetadataRoute } from "next";
import { listPublishedProgramSlugsForSitemap } from "@/lib/programs";

const BASE_URL = "https://israelprogramswiki.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const programs = await listPublishedProgramSlugsForSitemap();

  return [
    {
      url: BASE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/programs`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/mission`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    ...programs.map((program) => ({
      url: `${BASE_URL}/programs/${program.slug}`,
      lastModified: program.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
