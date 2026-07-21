import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Honored by Bing/Yandex/etc.; Googlebot ignores crawlDelay entirely
      // (its crawl rate is controlled via Search Console instead) -- this
      // only slows the crawlers that respect it, not a universal throttle.
      crawlDelay: 5,
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
