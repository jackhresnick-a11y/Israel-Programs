import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PATCH /api/admin/programs/[id]/tag-provenance must enforce admin authorization
 * SERVER-SIDE (requireRole("admin"), same as the sibling .../tags route) and reject an
 * invalid sourceUrl at write time rather than store it. Mocks the role gate and the
 * upsert write so the route runs without a real session or database -- same pattern as
 * app/api/admin/partner-links/route.test.ts.
 */
const requireRole = vi.hoisted(() => vi.fn());
const setTagProvenanceSpy = vi.hoisted(() => vi.fn(async () => ({ id: "prov_1" })));

vi.mock("@/lib/roles", () => ({ requireRole }));
vi.mock("@/lib/tagProvenance", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tagProvenance")>("@/lib/tagProvenance");
  return { ...actual, setTagProvenance: setTagProvenanceSpy };
});

const { PATCH } = await import("./route");

function patch(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/admin/programs/${id}/tag-provenance`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function callParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireRole.mockReset();
  setTagProvenanceSpy.mockClear();
});

describe("PATCH /api/admin/programs/[id]/tag-provenance authorization", () => {
  it("rejects a signed-out caller (401) and never writes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 401 });
    const res = await PATCH(patch("prog_1", { tagId: "tag_1", source: "OFFICIAL_SITE" }), callParams("prog_1"));
    expect(res.status).toBe(401);
    expect(setTagProvenanceSpy).not.toHaveBeenCalled();
    expect(requireRole).toHaveBeenCalledWith("admin");
  });

  it("rejects a signed-in non-admin (403) and never writes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });
    const res = await PATCH(patch("prog_1", { tagId: "tag_1", source: "OFFICIAL_SITE" }), callParams("prog_1"));
    expect(res.status).toBe(403);
    expect(setTagProvenanceSpy).not.toHaveBeenCalled();
  });

  it("admin with a valid source writes once, stamping verifiedBy from the session", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "admin_1" });
    const res = await PATCH(
      patch("prog_1", { tagId: "tag_1", source: "OFFICIAL_SITE", sourceUrl: "https://example.com", note: "seen on site" }),
      callParams("prog_1")
    );
    expect(res.status).toBe(200);
    expect(setTagProvenanceSpy).toHaveBeenCalledTimes(1);
    expect(setTagProvenanceSpy).toHaveBeenCalledWith(
      "prog_1",
      { tagId: "tag_1", source: "OFFICIAL_SITE", sourceUrl: "https://example.com", note: "seen on site" },
      "admin_1"
    );
  });

  it("admin with an invalid (non-http) sourceUrl is rejected (400) and never writes", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "admin_1" });
    const res = await PATCH(
      patch("prog_1", { tagId: "tag_1", source: "OFFICIAL_SITE", sourceUrl: "javascript:alert(1)" }),
      callParams("prog_1")
    );
    expect(res.status).toBe(400);
    expect(setTagProvenanceSpy).not.toHaveBeenCalled();
  });

  it("admin with an unknown source enum value is rejected (400) and never writes", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "admin_1" });
    const res = await PATCH(patch("prog_1", { tagId: "tag_1", source: "MADE_UP" }), callParams("prog_1"));
    expect(res.status).toBe(400);
    expect(setTagProvenanceSpy).not.toHaveBeenCalled();
  });
});
