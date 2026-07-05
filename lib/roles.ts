import { auth, currentUser } from "@clerk/nextjs/server";

export type Role = "user" | "moderator" | "admin";

export function normalizeRole(value: unknown): Role {
  return value === "admin" || value === "moderator" ? value : "user";
}

export async function getCurrentRole(): Promise<Role> {
  const user = await currentUser();
  return normalizeRole(user?.publicMetadata?.role);
}

type RoleCheck =
  | { ok: true; userId: string; role: Role }
  | { ok: false; status: 401 | 403 };

/** Returns an error result instead of throwing so route handlers can return it directly. */
export async function requireRole(minRole: "moderator" | "admin"): Promise<RoleCheck> {
  const { userId } = await auth();
  if (!userId) return { ok: false, status: 401 };

  const role = await getCurrentRole();
  const allowed = minRole === "admin" ? role === "admin" : role === "moderator" || role === "admin";
  if (!allowed) return { ok: false, status: 403 };

  return { ok: true, userId, role };
}

/** Any signed-in user, regardless of role — used by routes open to all contributors. */
export async function requireSignedIn(): Promise<RoleCheck> {
  const { userId } = await auth();
  if (!userId) return { ok: false, status: 401 };

  const role = await getCurrentRole();
  return { ok: true, userId, role };
}

export function isModeratorRole(role: Role): boolean {
  return role === "moderator" || role === "admin";
}
