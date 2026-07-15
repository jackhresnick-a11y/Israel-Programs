import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

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
        "/saved",
        // Deliberately NOT /s/ (shared folder links) -- a disallow would stop
        // crawlers from ever fetching the page to see its noindex metadata,
        // and WhatsApp/Facebook's link-preview scrapers need to fetch it
        // regardless to build a share card. See the folders design doc.
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
