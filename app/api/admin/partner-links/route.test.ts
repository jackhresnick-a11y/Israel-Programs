import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The partner-links write path must enforce admin authorization SERVER-SIDE (hiding the UI
 * is not enough), and must reject an invalid config (e.g. a non-http(s) url) at write time
 * rather than store it. We mock the role gate and the Prisma write so the route runs
 * without a real session or database.
 */
const requireRole = vi.hoisted(() => vi.fn());
const upsertSpy = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("@/lib/roles", () => ({ requireRole }));
vi.mock("@/lib/prisma", () => ({ prisma: { siteContent: { upsert: upsertSpy } } }));
// revalidateTag needs a real Next.js request context (the static generation store) that a
// route handler invoked directly in a unit test doesn't have -- see lib/siteContent.ts's
// upsertSiteContent, which now calls it after every write.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const { PATCH } = await import("./route");

function patch(body: unknown): Request {
  return new Request("http://localhost/api/admin/partner-links", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireRole.mockReset();
  upsertSpy.mockClear();
});

describe("PATCH /api/admin/partner-links authorization", () => {
  it("rejects a non-admin server-side and never writes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });
    const res = await PATCH(patch({ slots: [] }));
    expect(res.status).toBe(403);
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(requireRole).toHaveBeenCalledWith("admin");
  });

  it("admin with a valid config writes once", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200 });
    const res = await PATCH(patch({ slots: [] }));
    expect(res.status).toBe(200);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it("admin with an invalid (non-http) url is rejected and never writes", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200 });
    const res = await PATCH(patch({ slots: [{ id: "s1", placement: "COMPARE", label: "x", url: "javascript:alert(1)" }] }));
    expect(res.status).toBe(400);
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
