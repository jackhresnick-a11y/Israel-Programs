/**
 * Pure, Prisma-free resolver for the Alumni References public-list gate -- split out
 * the same way lib/pollShared.ts/lib/tagTints.ts are, so a "use client" admin control
 * can import it without pulling in lib/prisma.ts (which needs Node built-ins that don't
 * exist in a browser bundle).
 */

export type ReferenceVisibility = "AUTO" | "FORCE_SHOW" | "FORCE_HIDE";

export type ReferenceConfigLike = {
  visibility: ReferenceVisibility;
  /** Set once the program's approved count first reaches minToShow -- makes AUTO
   * sticky, so a later drop in count never re-hides an already-unlocked list. */
  unlockedAt: Date | null;
  minToShow: number;
};

/**
 * Whether the public reference list *may* be shown. FORCE_HIDE always wins. FORCE_SHOW
 * and the AUTO/sticky-unlocked case still require at least one approved reference --
 * callers must additionally check `approvedCount > 0` (or an empty list) before
 * rendering, since this function alone can't see the actual list. Never render an
 * empty section: `resolveReferenceVisibility(...) && approvedCount > 0` is the full
 * gate a page should apply.
 */
export function resolveReferenceVisibility(approvedCount: number, config: ReferenceConfigLike): boolean {
  if (config.visibility === "FORCE_HIDE") return false;
  if (config.visibility === "FORCE_SHOW") return true;
  return config.unlockedAt !== null || approvedCount >= config.minToShow;
}
