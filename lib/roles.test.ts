import { describe, it, expect, vi } from "vitest";

const mockAuth = vi.fn();
const mockCurrentUser = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
}));

const { requireRole, requireSignedIn, requireSignedInNotBanned, normalizeRole } = await import(
  "./roles"
);

/** Wires both Clerk calls requireRole/requireSignedIn depend on, matching what a real
 *  session of this shape would return -- userId from auth(), role from currentUser()'s
 *  publicMetadata (exactly what a Clerk dashboard "role" edit sets). */
function mockSession(userId: string | null, role?: "user" | "moderator" | "admin" | "banned") {
  mockAuth.mockResolvedValue({ userId });
  mockCurrentUser.mockResolvedValue(userId ? { publicMetadata: { role } } : null);
}

describe("requireRole", () => {
  it("signed-out -> 401, regardless of minRole", async () => {
    mockSession(null);
    expect(await requireRole("admin")).toEqual({ ok: false, status: 401 });
    expect(await requireRole("moderator")).toEqual({ ok: false, status: 401 });
  });

  it("plain user -> 403 against both admin and moderator", async () => {
    mockSession("user_1", "user");
    expect(await requireRole("admin")).toEqual({ ok: false, status: 403 });
    expect(await requireRole("moderator")).toEqual({ ok: false, status: 403 });
  });

  it("banned -> 403 against both admin and moderator (a role check, not a ban check)", async () => {
    mockSession("user_1", "banned");
    expect(await requireRole("admin")).toEqual({ ok: false, status: 403 });
    expect(await requireRole("moderator")).toEqual({ ok: false, status: 403 });
  });

  it("moderator -> ok against moderator, 403 against admin (no privilege escalation)", async () => {
    mockSession("user_1", "moderator");
    expect(await requireRole("moderator")).toEqual({ ok: true, userId: "user_1", role: "moderator" });
    expect(await requireRole("admin")).toEqual({ ok: false, status: 403 });
  });

  it("admin -> ok against both admin and moderator (admin satisfies the weaker gate)", async () => {
    mockSession("user_1", "admin");
    expect(await requireRole("admin")).toEqual({ ok: true, userId: "user_1", role: "admin" });
    expect(await requireRole("moderator")).toEqual({ ok: true, userId: "user_1", role: "admin" });
  });
});

describe("requireSignedIn", () => {
  it("signed-out -> 401", async () => {
    mockSession(null);
    expect(await requireSignedIn()).toEqual({ ok: false, status: 401 });
  });

  it("any signed-in role, including banned, is ok -- this gate doesn't check role or ban status", async () => {
    for (const role of ["user", "moderator", "admin", "banned"] as const) {
      mockSession("user_1", role);
      expect(await requireSignedIn()).toEqual({ ok: true, userId: "user_1", role });
    }
  });
});

describe("requireSignedInNotBanned", () => {
  it("signed-out -> 401", async () => {
    mockSession(null);
    expect(await requireSignedInNotBanned()).toEqual({ ok: false, status: 401 });
  });

  it("banned -> 403", async () => {
    mockSession("user_1", "banned");
    expect(await requireSignedInNotBanned()).toEqual({ ok: false, status: 403 });
  });

  it("user/moderator/admin -> ok", async () => {
    for (const role of ["user", "moderator", "admin"] as const) {
      mockSession("user_1", role);
      expect(await requireSignedInNotBanned()).toEqual({ ok: true, userId: "user_1", role });
    }
  });
});

describe("normalizeRole", () => {
  it("passes through the three privileged values", () => {
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("moderator")).toBe("moderator");
    expect(normalizeRole("banned")).toBe("banned");
  });

  it("falls back to 'user' for anything else -- undefined, garbage, or a spoofed value", () => {
    expect(normalizeRole(undefined)).toBe("user");
    expect(normalizeRole(null)).toBe("user");
    expect(normalizeRole("superadmin")).toBe("user");
    expect(normalizeRole(123)).toBe("user");
  });
});
