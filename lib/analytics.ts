import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

type EventRow = { type: "search" | "filter_use"; payload: Prisma.InputJsonValue };

/**
 * Fire-and-forget writer. after() runs once the response has streamed, and
 * any failure is logged and swallowed -- analytics must never block, slow,
 * or fail a page render.
 */
function record(rows: EventRow[]): void {
  if (rows.length === 0) return;
  after(async () => {
    try {
      await prisma.analyticsEvent.createMany({ data: rows });
    } catch (err) {
      console.error("[analytics] dropped", rows.length, "event(s)", err);
    }
  });
}

/** No-ops on an empty/whitespace query. */
export function trackSearch(q: string | undefined, resultCount: number): void {
  const query = q?.trim();
  if (!query) return;
  record([{ type: "search", payload: { q: query, resultCount } }]);
}

export type FilterSelections = {
  tags?: string[];
  duration?: string[];
  hasScholarship?: boolean;
  hasCollegeCredit?: boolean;
  travelType?: string;
};

/**
 * One event row per selected filter value, batched into a single createMany.
 * This makes "top 20 filters" a flat frequency count over (kind, value) with
 * no array-flattening at read time. No-ops when nothing is selected, so a
 * bare /programs visit (including a Nav prefetch) logs zero rows.
 *
 * Known caveat: every filter toggle re-renders the *cumulative* selection
 * (router.push to a new URL), so a filter picked early gets recounted on
 * every subsequent toggle in the same session. This measures "renders with
 * this filter active," which still ranks popularity sensibly; true per-toggle
 * diffing would require client state or cookies, which the no-cookies /
 * anonymous-only constraint rules out. Search has no equivalent noise --
 * SearchBar submits `q` on form submit only, not per keystroke.
 */
export function trackFilterUse(f: FilterSelections): void {
  const rows: EventRow[] = [];
  for (const t of f.tags ?? []) rows.push({ type: "filter_use", payload: { kind: "tag", value: t } });
  for (const d of f.duration ?? [])
    rows.push({ type: "filter_use", payload: { kind: "duration", value: d } });
  if (f.hasScholarship) rows.push({ type: "filter_use", payload: { kind: "hasScholarship", value: "true" } });
  if (f.hasCollegeCredit)
    rows.push({ type: "filter_use", payload: { kind: "hasCollegeCredit", value: "true" } });
  if (f.travelType) rows.push({ type: "filter_use", payload: { kind: "travelType", value: f.travelType } });
  record(rows);
}

export type AnalyticsSummary = {
  topFilters: { kind: string; value: string; count: number }[];
  topSearches: { q: string; count: number; zeroResultShare: number }[];
  zeroResultSearches: { q: string; count: number }[];
  perDay: { date: string; searches: number; filterUses: number }[];
};

function isFilterPayload(p: unknown): p is { kind: string; value: string } {
  return (
    typeof p === "object" &&
    p !== null &&
    typeof (p as Record<string, unknown>).kind === "string" &&
    typeof (p as Record<string, unknown>).value === "string"
  );
}

function isSearchPayload(p: unknown): p is { q: string; resultCount: number } {
  return (
    typeof p === "object" &&
    p !== null &&
    typeof (p as Record<string, unknown>).q === "string" &&
    typeof (p as Record<string, unknown>).resultCount === "number"
  );
}

/**
 * Aggregates in JS rather than SQL GROUP BY: Prisma can't group by JSON
 * sub-fields (the alternative is four hand-written $queryRaw calls), and at
 * this site's volume one indexed findMany + a JS pass is effectively free.
 * If volume ever grows enough to matter, swap the internals for $queryRaw
 * without touching callers -- this return type is the contract.
 */
export async function getAnalyticsSummary(days = 30): Promise<AnalyticsSummary> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await prisma.analyticsEvent.findMany({
    where: { createdAt: { gte: cutoff } },
    select: { type: true, payload: true, createdAt: true },
  });

  const filterCounts = new Map<string, { kind: string; value: string; count: number }>();
  const searchCounts = new Map<string, { q: string; count: number; zeroCount: number }>();
  // UTC day buckets, keyed by "YYYY-MM-DD", zero-filled below.
  const dayCounts = new Map<string, { searches: number; filterUses: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dayCounts.set(d.toISOString().slice(0, 10), { searches: 0, filterUses: 0 });
  }

  for (const event of events) {
    const day = event.createdAt.toISOString().slice(0, 10);
    const dayBucket = dayCounts.get(day);

    if (event.type === "filter_use" && isFilterPayload(event.payload)) {
      const key = `${event.payload.kind}:${event.payload.value}`;
      const existing = filterCounts.get(key);
      if (existing) existing.count++;
      else filterCounts.set(key, { kind: event.payload.kind, value: event.payload.value, count: 1 });
      if (dayBucket) dayBucket.filterUses++;
    } else if (event.type === "search" && isSearchPayload(event.payload)) {
      const key = event.payload.q.toLowerCase();
      const existing = searchCounts.get(key);
      const isZero = event.payload.resultCount === 0;
      if (existing) {
        existing.count++;
        if (isZero) existing.zeroCount++;
      } else {
        searchCounts.set(key, { q: key, count: 1, zeroCount: isZero ? 1 : 0 });
      }
      if (dayBucket) dayBucket.searches++;
    }
  }

  const topFilters = [...filterCounts.values()].sort((a, b) => b.count - a.count).slice(0, 20);

  const allSearches = [...searchCounts.values()];
  const topSearches = allSearches
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((s) => ({ q: s.q, count: s.count, zeroResultShare: s.zeroCount / s.count }));

  const zeroResultSearches = allSearches
    .filter((s) => s.zeroCount > 0)
    .map((s) => ({ q: s.q, count: s.zeroCount }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const perDay = [...dayCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  return { topFilters, topSearches, zeroResultSearches, perDay };
}
