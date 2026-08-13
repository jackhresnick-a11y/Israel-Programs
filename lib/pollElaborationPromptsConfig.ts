/**
 * Pure, client-safe config + resolver for the admin-editable open-ended prompts shown in
 * the end-of-poll elaboration block (components/polls/ElaborationBlock.tsx). Split from
 * lib/pollElaborationPrompts.ts (which imports lib/siteContent.ts -> lib/prisma.ts ->
 * `pg`) for the same reason as lib/partnerLinksConfig.ts vs lib/partnerLinks.ts: the
 * client component and the admin manager need only these types/zod/helpers, never the
 * Prisma-backed reads.
 *
 * Stored as one SiteContent("pollElaborationPrompts") JSON blob rather than a table --
 * same "small admin-editable list, no need for a DB table" precedent as PartnerLinksConfig
 * and HomeVideoConfig. `key` is the stable identity a submitted PollElaborationAnswer
 * references (a soft ref, not a FK -- see the schema doc comment); rewording `text` later
 * never re-groups or orphans existing answers, since each answer snapshots its own
 * `promptText` at submit time.
 */
import { z } from "zod";

export const elaborationPromptSchema = z.object({
  key: z.string().trim().min(1).max(64),
  text: z.string().trim().min(1).max(300),
  enabled: z.boolean().default(true),
});
export type ElaborationPrompt = z.infer<typeof elaborationPromptSchema>;

export const elaborationPromptsConfigSchema = z.object({
  v: z.literal(1).default(1),
  prompts: z.array(elaborationPromptSchema).default([]),
});
export type ElaborationPromptsConfig = z.infer<typeof elaborationPromptsConfigSchema>;

/** Seed/fallback set -- the four prompts named in the build spec. Used whenever the
 * SiteContent key is absent or unparseable, so the block always has something to show
 * without requiring an admin to configure it first. */
export const DEFAULT_ELABORATION_PROMPTS: ElaborationPromptsConfig = {
  v: 1,
  prompts: [
    { key: "wish_known", text: "What do you wish you'd known before you came?", enabled: true },
    { key: "wrong_for", text: "Who would this program be wrong for?", enabled: true },
    { key: "surprised", text: "What surprised you most?", enabled: true },
    { key: "year_before", text: "What would you tell yourself the year before you went?", enabled: true },
  ],
};

/**
 * Parses the stored JSON into a config, tolerating one malformed prompt rather than
 * discarding the whole config (same independence posture as parsePartnerLinksConfig). An
 * unreadable/missing/shape-wrong blob falls back to DEFAULT_ELABORATION_PROMPTS -- unlike
 * partner links (which fail closed to nothing), this block has no "off" state in the spec,
 * so falling back to the seed defaults is the correct failure mode, not an empty result.
 */
export function parseElaborationPrompts(raw: string | null): ElaborationPromptsConfig {
  if (!raw) return DEFAULT_ELABORATION_PROMPTS;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return DEFAULT_ELABORATION_PROMPTS;
  }
  if (!json || typeof json !== "object" || !Array.isArray((json as { prompts?: unknown }).prompts)) {
    return DEFAULT_ELABORATION_PROMPTS;
  }
  const prompts: ElaborationPrompt[] = [];
  for (const element of (json as { prompts: unknown[] }).prompts) {
    const parsed = elaborationPromptSchema.safeParse(element);
    if (parsed.success) prompts.push(parsed.data);
  }
  if (prompts.length === 0) return DEFAULT_ELABORATION_PROMPTS;
  return { v: 1, prompts };
}

/** The enabled prompts, in stored order -- what the chooser and the admin preview show. */
export function enabledPrompts(config: ElaborationPromptsConfig): ElaborationPrompt[] {
  return config.prompts.filter((p) => p.enabled);
}

/**
 * The prompts still available to answer -- enabled prompts minus whatever keys this
 * response has already answered. Pure so both ElaborationBlock and its test can call it
 * directly; the "Answer another" reopen and the initial chooser both go through this same
 * function, so they can never disagree about what's left.
 */
export function remainingPrompts(prompts: ElaborationPrompt[], answeredKeys: string[]): ElaborationPrompt[] {
  const answered = new Set(answeredKeys);
  return prompts.filter((p) => !answered.has(p.key));
}
