/**
 * Split out from lib/tags.ts because that file imports the Prisma client (via
 * lib/prisma.ts, which pulls in `pg`) -- fine for server components/routes, but
 * SearchBar.tsx is a "use client" component that only needs tint validation, and
 * bundling `pg` into the client build fails (it needs Node built-ins like `tls`).
 */
import type { FilterDropdownTint } from "@/components/ui/FilterDropdown";

export const VALID_TINTS: FilterDropdownTint[] = ["accent", "info", "success", "warning", "danger", "violet"];

/** Coerces a free-form DB tint string to a known FilterDropdownTint, falling back to
 * "accent" -- protects the filter bar from breaking if a tint value becomes stale
 * (e.g. after a code change removes a tint that's still referenced in the DB). */
export function coerceTint(tint: string): FilterDropdownTint {
  return (VALID_TINTS as string[]).includes(tint) ? (tint as FilterDropdownTint) : "accent";
}
