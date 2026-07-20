import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSiteContent } from "@/lib/siteContent";
import type { ProgramCardProgram } from "@/components/ProgramCard";

export const DEFAULT_HEADING = "Recently added";
export const MAX_ITEMS = 24;

export type RecentlyAddedMode = "auto" | "manual";

export type RecentlyAddedItem = {
  slug: string;
  videoId?: string;
};

const itemSchema = z.object({
  slug: z.string().min(1),
  videoId: z.string().min(1).optional(),
});

const itemsSchema = z.array(itemSchema).max(MAX_ITEMS);

/** Parses the stored `recentlyAddedItems` JSON; malformed/missing data degrades to an empty list. */
export function parseRecentlyAddedItems(raw: string | null): RecentlyAddedItem[] {
  if (!raw) return [];
  try {
    return itemsSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function getRecentlyAddedConfig(): Promise<{
  heading: string;
  mode: RecentlyAddedMode;
  items: RecentlyAddedItem[];
}> {
  const [heading, mode, itemsRaw] = await Promise.all([
    getSiteContent("recentlyAddedHeading"),
    getSiteContent("recentlyAddedMode"),
    getSiteContent("recentlyAddedItems"),
  ]);

  return {
    heading: heading || DEFAULT_HEADING,
    mode: mode === "manual" ? "manual" : "auto",
    items: parseRecentlyAddedItems(itemsRaw),
  };
}

export type ResolvedRecentlyAddedItem = {
  program: ProgramCardProgram;
  video: { id: string; url: string } | null;
};

/**
 * Fetches the referenced programs in the admin's chosen order, dropping any
 * slug that no longer resolves to a published program and any videoId that
 * no longer belongs to that program -- same defensive shape as
 * getProgramsBySlugs (lib/programs.ts) for stale references.
 */
export async function resolveManualItems(
  items: RecentlyAddedItem[]
): Promise<ResolvedRecentlyAddedItem[]> {
  if (items.length === 0) return [];

  const slugs = items.map((item) => item.slug);
  const programs = await prisma.program.findMany({
    where: { slug: { in: slugs }, status: "PUBLISHED" },
    include: { tags: true, reviews: { where: { status: "PUBLISHED" } }, videos: true },
  });
  const bySlug = new Map(programs.map((p) => [p.slug, p]));

  const resolved: ResolvedRecentlyAddedItem[] = [];
  for (const item of items) {
    const program = bySlug.get(item.slug);
    if (!program) continue;
    const video = item.videoId
      ? (program.videos.find((v) => v.id === item.videoId) ?? null)
      : null;
    resolved.push({ program, video: video ? { id: video.id, url: video.url } : null });
  }
  return resolved;
}

/** Groups every published program's videos by slug, for the admin video picker. */
export async function listVideoOptionsByProgramSlug(): Promise<
  Record<string, { id: string; label: string }[]>
> {
  const videos = await prisma.video.findMany({
    where: { program: { status: "PUBLISHED" } },
    select: { id: true, filename: true, caption: true, program: { select: { slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  const bySlug: Record<string, { id: string; label: string }[]> = {};
  for (const video of videos) {
    const slug = video.program.slug;
    const list = bySlug[slug] ?? (bySlug[slug] = []);
    list.push({ id: video.id, label: video.caption || video.filename });
  }
  return bySlug;
}
