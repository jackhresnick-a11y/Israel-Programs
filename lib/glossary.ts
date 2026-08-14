import { getSiteContent, upsertSiteContent } from "@/lib/siteContent";
import {
  DEFAULT_GLOSSARY_ENTRIES,
  glossaryEntriesSchema,
  type GlossaryEntry,
} from "@/lib/glossaryContent";

export {
  glossaryEntryKindSchema,
  glossaryEntrySchema,
  glossaryEntriesSchema,
  glossaryArticleJsonLd,
  DEFAULT_GLOSSARY_ENTRIES,
  type GlossaryEntryKind,
  type GlossaryEntry,
  type GlossarySection,
  type GlossaryProgramLink,
} from "@/lib/glossaryContent";

const GLOSSARY_ENTRIES_KEY = "glossaryEntries";

/** Reads the admin-edited glossary from SiteContent; falls back to
 * DEFAULT_GLOSSARY_ENTRIES when no row exists yet or the stored JSON fails to parse. */
export async function getGlossaryEntries(): Promise<GlossaryEntry[]> {
  const raw = await getSiteContent(GLOSSARY_ENTRIES_KEY);
  if (!raw) return DEFAULT_GLOSSARY_ENTRIES;
  try {
    return glossaryEntriesSchema.parse(JSON.parse(raw));
  } catch {
    return DEFAULT_GLOSSARY_ENTRIES;
  }
}

export async function getGlossaryEntry(slug: string): Promise<GlossaryEntry | null> {
  const entries = await getGlossaryEntries();
  return entries.find((e) => e.slug === slug) ?? null;
}

/** Not called from any route yet -- this is the write path a future admin form will use
 * (same shape as lib/mission.ts's saveMissionBlocks). */
export async function saveGlossaryEntries(entries: GlossaryEntry[]) {
  return upsertSiteContent(GLOSSARY_ENTRIES_KEY, JSON.stringify(entries));
}
