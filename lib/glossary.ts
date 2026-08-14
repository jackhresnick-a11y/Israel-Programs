import { getSiteContent, upsertSiteContent } from "@/lib/siteContent";
import {
  DEFAULT_GLOSSARY_ENTRIES,
  glossaryEntriesSchema,
  isGlossaryEntryPublished,
  type GlossaryEntry,
} from "@/lib/glossaryContent";

export {
  glossaryEntryKindSchema,
  glossaryEntrySchema,
  glossaryEntriesSchema,
  glossaryArticleJsonLd,
  isGlossaryEntryPublished,
  DEFAULT_GLOSSARY_ENTRIES,
  type GlossaryEntryKind,
  type GlossaryEntry,
  type GlossarySection,
  type GlossaryProgramLink,
} from "@/lib/glossaryContent";

const GLOSSARY_ENTRIES_KEY = "glossaryEntries";

/** Raw/unfiltered -- every entry regardless of `published` state. Used by the admin
 * page (which needs to see and edit unpublished entries) and as the base for
 * getPublishedGlossaryEntries below. Reads the admin-edited glossary from SiteContent;
 * falls back to DEFAULT_GLOSSARY_ENTRIES when no row exists yet or the stored JSON
 * fails to parse. */
export async function getGlossaryEntries(): Promise<GlossaryEntry[]> {
  const raw = await getSiteContent(GLOSSARY_ENTRIES_KEY);
  if (!raw) return DEFAULT_GLOSSARY_ENTRIES;
  try {
    return glossaryEntriesSchema.parse(JSON.parse(raw));
  } catch {
    return DEFAULT_GLOSSARY_ENTRIES;
  }
}

/** Public-facing subset -- used by the /glossary index and the sitemap, neither of
 * which should ever surface an entry an admin has unpublished. */
export async function getPublishedGlossaryEntries(): Promise<GlossaryEntry[]> {
  const entries = await getGlossaryEntries();
  return entries.filter(isGlossaryEntryPublished);
}

/** Raw lookup -- returns an entry regardless of its published state. The detail page
 * needs this (not the published-only list) because it decides for itself, based on
 * viewer role, whether to 404 or render the entry with a "hidden from public" banner. */
export async function getGlossaryEntry(slug: string): Promise<GlossaryEntry | null> {
  const entries = await getGlossaryEntries();
  return entries.find((e) => e.slug === slug) ?? null;
}

/** Admin write path -- app/api/admin/glossary/route.ts's PATCH handler is the only
 * caller (same shape as lib/mission.ts's saveMissionBlocks). */
export async function saveGlossaryEntries(entries: GlossaryEntry[]) {
  return upsertSiteContent(GLOSSARY_ENTRIES_KEY, JSON.stringify(entries));
}
