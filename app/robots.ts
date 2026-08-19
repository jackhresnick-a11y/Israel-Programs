import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

// Deliberately NOT /s/ in any disallow list below (shared folder links) -- a disallow
// would stop crawlers from ever fetching the page to see its noindex metadata, and
// WhatsApp/Facebook's link-preview scrapers need to fetch it regardless to build a
// share card. See the folders design doc.
const GENERAL_DISALLOW = [
  "/admin",
  "/api/",
  "/programs/new",
  "/programs/*/edit",
  "/mission/edit",
  "/references/",
  "/compare",
  "/saved",
];

// The audience this site is being optimized for -- explicitly allowed rather than left
// to fall through the wildcard rule, so a future tightening of the "*" group can't
// accidentally block them. Per-agent group, not the general disallow list: these
// crawlers don't need write/admin surfaces either, but the low-value browse-adjacent
// paths (/compare, /saved, /references/) aren't a crawl-budget concern for them the way
// they are for a search indexer -- only the truly private/write paths are withheld.
const AI_CRAWLER_DISALLOW = ["/admin", "/api/"];
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
];

// Crawlers that consume content without sending traffic or citing back -- scrapers and
// SEO-tool bots, not search or AI-answer engines. Blocked outright rather than merely
// crawl-delayed.
const NO_VALUE_CRAWLERS = ["Bytespider", "Amazonbot", "AhrefsBot", "SemrushBot", "DotBot", "MJ12bot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // No crawlDelay: Googlebot ignores it anyway (crawl rate is controlled via
        // Search Console), but it does throttle Bing to ~12 URLs/min -- the wrong
        // tradeoff right after recovering from a sitewide noindex, when ~470 URLs need
        // re-crawling as fast as those crawlers are willing to go.
        disallow: GENERAL_DISALLOW,
      },
      {
        userAgent: AI_CRAWLERS,
        allow: "/",
        disallow: AI_CRAWLER_DISALLOW,
      },
      {
        userAgent: NO_VALUE_CRAWLERS,
        disallow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
