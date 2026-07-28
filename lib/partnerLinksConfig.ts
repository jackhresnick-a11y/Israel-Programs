/**
 * Pure, client-safe config + resolver for the admin-managed "Partner Links" CTAs. Split
 * from lib/partnerLinks.ts (which imports lib/siteContent.ts -> lib/prisma.ts -> `pg`)
 * for the same reason as lib/homeVideoConfig.ts vs lib/homeVideo.ts: PartnerLinksManager
 * ("use client") and any client render path need only these types/zod/resolver, never the
 * Prisma-backed reads.
 *
 * Everything is OFF by default and FAIL-CLOSED: a missing/unreadable config, a disabled
 * slot, or a slot with a blank/invalid url resolves to nothing. Every slot is evaluated
 * INDEPENDENTLY -- one malformed slot is dropped on parse without affecting any other, and
 * a slot is never computed as part of a set.
 */
import { z } from "zod";

/** The five fixed places a partner CTA can render. A slot targets exactly one. */
export const PARTNER_PLACEMENTS = [
  "PROGRAM_NO_REFERENCES",
  "PROGRAM_LOCKED",
  "COMPARE",
  "POST_POLL",
  "EMPTY_SEARCH",
] as const;
export type PartnerPlacement = (typeof PARTNER_PLACEMENTS)[number];

export const PARTNER_SCOPES = ["all", "categories", "programs"] as const;
export type PartnerScope = (typeof PARTNER_SCOPES)[number];

/** True for a non-empty http(s) URL -- the single "is this a usable link" gate, shared by
 * the storage schema's refinement and the render-time renderability check. */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * One partner CTA. Plain text only (escaped by React on render); `url` must be http(s)
 * when non-empty (a blank url is a valid "draft" state that simply renders nothing). Max
 * lengths per the spec: header 60, description 200, label 60.
 */
export const partnerLinkSlotSchema = z.object({
  id: z.string().min(1).max(64),
  placement: z.enum(PARTNER_PLACEMENTS),
  enabled: z.boolean().default(false),
  header: z.string().trim().max(60).default(""),
  description: z.string().trim().max(200).default(""),
  label: z.string().trim().max(60).default(""),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || isHttpUrl(v), { message: "URL must be http(s)" })
    .default(""),
  showDisclosure: z.boolean().default(true),
  scope: z.enum(PARTNER_SCOPES).default("all"),
  scopeValues: z.array(z.string().trim().min(1).max(200)).default([]),
});
export type PartnerLinkSlot = z.infer<typeof partnerLinkSlotSchema>;

export const partnerLinksConfigSchema = z.object({
  slots: z.array(partnerLinkSlotSchema).default([]),
});
export type PartnerLinksConfig = z.infer<typeof partnerLinksConfigSchema>;

export const EMPTY_PARTNER_LINKS_CONFIG: PartnerLinksConfig = { slots: [] };

/**
 * Parses the stored JSON into a config, tolerating a bad individual slot rather than
 * discarding the whole config (INDEPENDENCE). An unreadable/missing/shape-wrong blob
 * degrades to the empty config (FAIL-CLOSED) so nothing renders.
 */
export function parsePartnerLinksConfig(raw: string | null): PartnerLinksConfig {
  if (!raw) return EMPTY_PARTNER_LINKS_CONFIG;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return EMPTY_PARTNER_LINKS_CONFIG;
  }
  if (!json || typeof json !== "object" || !Array.isArray((json as { slots?: unknown }).slots)) {
    return EMPTY_PARTNER_LINKS_CONFIG;
  }
  const slots: PartnerLinkSlot[] = [];
  for (const element of (json as { slots: unknown[] }).slots) {
    const parsed = partnerLinkSlotSchema.safeParse(element);
    if (parsed.success) slots.push(parsed.data);
  }
  return { slots };
}

/** A slot renders only when enabled, with a usable http(s) url AND a non-empty label. A
 * blank/invalid url renders the entire slot as nothing even when header/description/label
 * are filled -- never an orphaned header with no working link. */
export function isRenderableSlot(slot: PartnerLinkSlot): boolean {
  return slot.enabled && slot.label.trim().length > 0 && isHttpUrl(slot.url);
}

const SCOPE_SPECIFICITY: Record<PartnerScope, number> = { programs: 3, categories: 2, all: 1 };

export type PartnerResolveContext = {
  /** The current program id, for `programs`-scoped matching. Absent off a program page. */
  programId?: string;
  /** The current program's category slugs, for `categories`-scoped matching. */
  categories?: string[];
  /** Which scopes are even allowed here. Compare / post-poll / empty-search pass
   * `["all"]` (they have no single-program context to resolve a narrower scope against);
   * a program page allows all three. Defaults to all scopes. */
  allowedScopes?: readonly PartnerScope[];
};

function scopeMatches(slot: PartnerLinkSlot, ctx: PartnerResolveContext): boolean {
  switch (slot.scope) {
    case "all":
      return true;
    case "categories":
      return (ctx.categories ?? []).some((c) => slot.scopeValues.includes(c));
    case "programs":
      return ctx.programId != null && slot.scopeValues.includes(ctx.programId);
    default:
      return false;
  }
}

/**
 * Resolves the single winning slot for one placement, or null. Among enabled, renderable,
 * in-scope candidates the MOST SPECIFIC scope wins (programs > categories > all); on a tie
 * the one listed first in admin order wins (slots are iterated in stored order and a later
 * slot only replaces the winner when strictly more specific). Exactly one slot ever
 * renders per placement -- callers never stack.
 */
export function resolvePartnerSlot(
  config: PartnerLinksConfig,
  placement: PartnerPlacement,
  ctx: PartnerResolveContext = {}
): PartnerLinkSlot | null {
  const allowed = ctx.allowedScopes ?? PARTNER_SCOPES;
  let winner: PartnerLinkSlot | null = null;
  for (const slot of config.slots) {
    if (slot.placement !== placement) continue;
    if (!isRenderableSlot(slot)) continue;
    if (!allowed.includes(slot.scope)) continue;
    if (!scopeMatches(slot, ctx)) continue;
    if (winner === null || SCOPE_SPECIFICITY[slot.scope] > SCOPE_SPECIFICITY[winner.scope]) {
      winner = slot;
    }
  }
  return winner;
}

export type ProgramPagePartnerCta = { slot: PartnerLinkSlot; placement: PartnerPlacement };

/**
 * The program page's ONE-PER-PAGE decision as a pure function. Slot 4
 * (PROGRAM_LOCKED) and slot 1 (PROGRAM_NO_REFERENCES) can both qualify; when they do,
 * slot 4 wins. Returns which placement won so the caller renders it in the right region
 * (poll region vs references region) and nothing in the other -- at most one CTA per page.
 */
export function resolveProgramPageSlot(
  config: PartnerLinksConfig,
  input: { programId: string; categories: string[]; hasReferences: boolean; pollVisible: boolean }
): ProgramPagePartnerCta | null {
  const ctx = { programId: input.programId, categories: input.categories };
  if (!input.pollVisible) {
    const locked = resolvePartnerSlot(config, "PROGRAM_LOCKED", ctx);
    if (locked) return { slot: locked, placement: "PROGRAM_LOCKED" };
  }
  if (!input.hasReferences) {
    const noRefs = resolvePartnerSlot(config, "PROGRAM_NO_REFERENCES", ctx);
    if (noRefs) return { slot: noRefs, placement: "PROGRAM_NO_REFERENCES" };
  }
  return null;
}

/** Per-placement admin metadata: plain-language description, seed defaults for a new slot,
 * and whether the placement supports program/category scoping at all (the three
 * single-context-less placements are `all`-only). */
export const PLACEMENT_META: Record<
  PartnerPlacement,
  { label: string; defaultLabel: string; defaultShowDisclosure: boolean; allowsScoping: boolean }
> = {
  PROGRAM_NO_REFERENCES: {
    label: "Program page — when the program has no alumni references",
    defaultLabel: "Having trouble deciding? Ask for a mentor from IsraelTrack",
    defaultShowDisclosure: true,
    allowsScoping: true,
  },
  PROGRAM_LOCKED: {
    label: "Program page — locked / insufficient-ratings state",
    defaultLabel: "Having trouble deciding? Ask for a mentor from IsraelTrack",
    defaultShowDisclosure: true,
    allowsScoping: true,
  },
  COMPARE: {
    label: "Bottom of compare mode (2+ programs selected)",
    defaultLabel: "Having trouble deciding? Ask for a mentor from IsraelTrack",
    defaultShowDisclosure: true,
    allowsScoping: false,
  },
  POST_POLL: {
    label: "Post-poll confirmation (after a rating is submitted)",
    defaultLabel: "Apply to become a mentor on IsraelTrack",
    defaultShowDisclosure: false,
    allowsScoping: false,
  },
  EMPTY_SEARCH: {
    label: "Search / filter results when nothing matches",
    defaultLabel: "Can't find what you're looking for? A mentor can help",
    defaultShowDisclosure: true,
    allowsScoping: false,
  },
};
