import type { MetadataRoute } from "next";

const BASE_URL = "https://israelprogramswiki.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/programs/new",
        "/programs/*/edit",
        "/mission/edit",
        "/references/",
        "/compare",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
