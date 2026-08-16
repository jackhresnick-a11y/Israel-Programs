import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";

const SITE_CONTENT_TAG = "site-content";

/** Exported (not just the private half of getSiteContent below) so a caller that's
 * itself building an uncached read -- e.g. lib/pollRankData.ts's
 * getPollRankStatsUncached, which a bare `tsx` script calls outside any Next
 * request/work-unit store, where unstable_cache-wrapped functions throw -- can reach
 * the same query without going through the cached wrapper. */
export async function fetchSiteContent(key: string): Promise<string | null> {
  const row = await prisma.siteContent.findUnique({ where: { key } });
  return row?.body ?? null;
}

async function fetchSiteContentMany(keys: string[]): Promise<Record<string, string | null>> {
  const rows = await prisma.siteContent.findMany({
    where: { key: { in: keys } },
    select: { key: true, body: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.body]));
  const result: Record<string, string | null> = {};
  for (const key of keys) {
    result[key] = byKey.get(key) ?? null;
  }
  return result;
}

// header logo, the assistant-enabled toggle, background settings, and mission copy
// are all read through here on nearly every public page render -- caching removes an
// uncached Prisma round-trip per key, per request. Tagged and invalidated by
// upsertSiteContent/deleteSiteContent below, so an admin edit shows up immediately
// rather than waiting on a timer.
export const getSiteContent = unstable_cache(fetchSiteContent, ["site-content"], {
  tags: [SITE_CONTENT_TAG],
});

/** Batched form of getSiteContent -- one round-trip for many keys instead of one per key.
 * Keys with no row (or no value) resolve to null, same as getSiteContent. */
export const getSiteContentMany = unstable_cache(fetchSiteContentMany, ["site-content-many"], {
  tags: [SITE_CONTENT_TAG],
});

export async function upsertSiteContent(key: string, body: string) {
  const row = await prisma.siteContent.upsert({
    where: { key },
    update: { body },
    create: { key, body },
  });
  // { expire: 0 } is Next 16's non-deprecated spelling of "invalidate now" --
  // revalidateTag(tag) alone still works but logs a deprecation warning on every call.
  revalidateTag(SITE_CONTENT_TAG, { expire: 0 });
  return row;
}

export async function deleteSiteContent(key: string) {
  await prisma.siteContent.deleteMany({ where: { key } });
  // { expire: 0 } is Next 16's non-deprecated spelling of "invalidate now" --
  // revalidateTag(tag) alone still works but logs a deprecation warning on every call.
  revalidateTag(SITE_CONTENT_TAG, { expire: 0 });
}
