/**
 * Pure logic behind two admin screens' interactive filtering/preview -- split out (no
 * Prisma, no React) so it's unit-testable without a browser or a database, same posture
 * as lib/pollBestFor.ts. Extracted rather than left inline in
 * components/admin/ProgramsAdminManager.tsx / PollQuestionsAdminManager.tsx so the
 * AND-semantics tag filter and the pending-edit resolution have exactly one
 * implementation each, tested directly instead of only indirectly through a component.
 */
import type { PollQuestionTier } from "@/app/generated/prisma/enums";

/**
 * /admin/programs' tag filter: a program matches only when it carries EVERY selected
 * tag slug (AND, not OR) -- an empty selection matches every program (no filter
 * applied). Pure set membership, no ordering dependence.
 */
export function programMatchesTagFilter(programTagSlugs: string[], selectedTagSlugs: string[]): boolean {
  if (selectedTagSlugs.length === 0) return true;
  const owned = new Set(programTagSlugs);
  return selectedTagSlugs.every((slug) => owned.has(slug));
}

/**
 * /admin/poll-questions' live-preview panel needs each question's *effective* tier --
 * whatever the admin has locally edited it to (not yet saved), falling back to the
 * question's actually-saved tier when untouched. Both the strip preview and every
 * category section's "how many changed" / "0 Defining" checks read through this one
 * function so they can never disagree about what a question's current tier is.
 */
export function resolveEffectiveTier(
  pendingTiers: Map<string, PollQuestionTier>,
  questionId: string,
  savedTier: PollQuestionTier
): PollQuestionTier {
  return pendingTiers.get(questionId) ?? savedTier;
}
