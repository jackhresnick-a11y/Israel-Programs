import { getSiteContent, upsertSiteContent } from "@/lib/siteContent";
import { prisma } from "@/lib/prisma";
import {
  parsePartnerLinksConfig,
  resolvePartnerSlot,
  resolveProgramPageSlot,
  type PartnerLinksConfig,
  type PartnerLinkSlot,
  type PartnerPlacement,
  type ProgramPagePartnerCta,
} from "@/lib/partnerLinksConfig";

// Re-export the pure symbols so server callers can import everything from one place, same
// convention as lib/homeVideo.ts re-exporting lib/homeVideoConfig.ts.
export * from "@/lib/partnerLinksConfig";

/** The single SiteContent record holding all partner-link config. No new table -- just
 * this JSON blob, mirroring the homeVideo config key. */
const CONFIG_KEY = "partnerLinks";

export async function getPartnerLinksConfig(): Promise<PartnerLinksConfig> {
  return parsePartnerLinksConfig(await getSiteContent(CONFIG_KEY));
}

export async function savePartnerLinksConfig(config: PartnerLinksConfig): Promise<void> {
  await upsertSiteContent(CONFIG_KEY, JSON.stringify(config));
}

/** The distinct category slugs a program belongs to, via its tags' `category`. Feeds the
 * `categories`-scoped resolution for the two program-page placements only. */
async function getProgramCategorySlugs(programId: string): Promise<string[]> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { tags: { select: { category: true } } },
  });
  const categories = (program?.tags ?? [])
    .map((t) => t.category)
    .filter((c): c is string => Boolean(c));
  return [...new Set(categories)];
}

/**
 * Resolves the single partner CTA for a program page, enforcing the ONE-PER-PAGE rule via
 * the pure resolveProgramPageSlot (slot 4 wins any tie with slot 1). Returns which
 * placement won so the page renders it in the right region (the poll region for
 * PROGRAM_LOCKED, the references region for PROGRAM_NO_REFERENCES) -- and nothing else.
 */
export async function resolveProgramPagePartnerCta(input: {
  programId: string;
  hasReferences: boolean;
  pollVisible: boolean;
}): Promise<ProgramPagePartnerCta | null> {
  const config = await getPartnerLinksConfig();
  // Cheap short-circuit: skip the category lookup entirely if no program-page slot exists.
  const hasProgramPageSlot = config.slots.some(
    (s) => s.placement === "PROGRAM_LOCKED" || s.placement === "PROGRAM_NO_REFERENCES"
  );
  if (!hasProgramPageSlot) return null;

  const categories = await getProgramCategorySlugs(input.programId);
  return resolveProgramPageSlot(config, {
    programId: input.programId,
    categories,
    hasReferences: input.hasReferences,
    pollVisible: input.pollVisible,
  });
}

/**
 * Resolves an `all`-scope-only placement (compare, post-poll, empty-search). These have no
 * single-program context, so only `all`-scoped slots are ever considered -- a program- or
 * category-scoped slot mistakenly pointed here never resolves.
 */
export async function resolveAllScopePartnerCta(
  placement: Extract<PartnerPlacement, "COMPARE" | "POST_POLL" | "EMPTY_SEARCH">
): Promise<PartnerLinkSlot | null> {
  const config = await getPartnerLinksConfig();
  return resolvePartnerSlot(config, placement, { allowedScopes: ["all"] });
}
