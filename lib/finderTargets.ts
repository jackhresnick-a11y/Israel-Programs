/**
 * Originally split out from the old lib/finder.ts (v1's /find, since removed -- see
 * next.config.ts's redirect to /match) because that file imported the Prisma client
 * (via lib/prisma.ts, which pulls in `pg`) -- fine for server components/routes, but
 * a "use client" preview component only needed the pure URL-assembly logic, and
 * bundling `pg` into the client build fails (it needs Node built-ins like `tls`). No
 * client component imports this directly anymore, but the same Prisma-free
 * requirement still holds for its remaining server-side callers (lib/flow.ts,
 * lib/searchIntent.ts, lib/tagProvenanceShared.ts), so the split stays. Same shape as
 * lib/tagTints.ts's split from lib/tags.ts.
 */

/**
 * Pure param assembly, no DB access -- the one place both buildProgramsHref (server,
 * after dropping any stale tag slug / invalid duration value) and the admin UI's
 * per-option preview (client, straight from the stored columns) build the same
 * /programs URL shape from a tagSlugs/durationValues pair. Deduped, comma-joined,
 * `tags`/`duration` only -- never `q`/`hasScholarship`/`hasCollegeCredit`/`travelType`.
 */
export function assembleProgramsHref(tagSlugs: string[], durationValues: string[]): string {
  const params = new URLSearchParams();
  const dedupedTags = [...new Set(tagSlugs)];
  const dedupedDurations = [...new Set(durationValues)];
  if (dedupedTags.length > 0) params.set("tags", dedupedTags.join(","));
  if (dedupedDurations.length > 0) params.set("duration", dedupedDurations.join(","));

  const qs = params.toString();
  return qs ? `/programs?${qs}` : "/programs";
}
