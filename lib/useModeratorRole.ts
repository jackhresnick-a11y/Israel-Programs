"use client";

import { useUser } from "@clerk/nextjs";

/**
 * Cosmetic-only check for whether to show a moderator-only control -- reads Clerk's
 * cached user object client-side (publicMetadata is exposed via the Frontend API) so
 * a page doesn't need a server-side auth() call just to decide what to render. This
 * is NOT the authorization boundary: every moderator action still calls an API route
 * that independently enforces requireRole()/isModeratorRole() (lib/roles.ts).
 */
export function useIsModerator(): boolean {
  const { user } = useUser();
  const role = user?.publicMetadata?.role;
  return role === "moderator" || role === "admin";
}
