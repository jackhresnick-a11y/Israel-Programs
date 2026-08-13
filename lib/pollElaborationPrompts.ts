import { getSiteContent, upsertSiteContent } from "@/lib/siteContent";
import { parseElaborationPrompts, type ElaborationPromptsConfig } from "@/lib/pollElaborationPromptsConfig";

// Re-export the pure symbols so server callers can import everything from one place, same
// convention as lib/partnerLinks.ts re-exporting lib/partnerLinksConfig.ts.
export * from "@/lib/pollElaborationPromptsConfig";

/** The single SiteContent record holding the elaboration prompt list. No new table --
 * just this JSON blob, mirroring the partnerLinks/homeVideo config keys. */
const CONFIG_KEY = "pollElaborationPrompts";

export async function getElaborationPromptsConfig(): Promise<ElaborationPromptsConfig> {
  return parseElaborationPrompts(await getSiteContent(CONFIG_KEY));
}

export async function saveElaborationPromptsConfig(config: ElaborationPromptsConfig): Promise<void> {
  await upsertSiteContent(CONFIG_KEY, JSON.stringify(config));
}
