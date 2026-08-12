import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Regression coverage for a reported "editing a question's show-condition fails with
 * Unauthorized" bug. The route turned out to have no auth gap at all -- showWhen is one
 * optional key in the SAME PATCH schema/handler as prompt/type/skippable/etc, gated by
 * the identical requireRole("admin") block every other admin/flow route uses. These
 * tests assert that identity directly: showWhen and prompt hit the same gate, in the
 * same order (401/403 before the body is ever parsed), so a future refactor can't
 * reintroduce a showWhen-specific auth path without failing here.
 *
 * Mirrors app/api/admin/partner-links/route.test.ts's mocking shape. @/lib/flow is only
 * partially mocked -- flowConditionSchema/flowOptionSetRulesSchema stay real (imported
 * from @/lib/flowShared, no Prisma dependency) so the route's zod validation is exercised
 * for real, and only updateFlowQuestion/deleteFlowQuestion (the Prisma-backed writes) are
 * stubbed.
 */
const requireRole = vi.hoisted(() => vi.fn());
const updateFlowQuestion = vi.hoisted(() => vi.fn(async (id: string, body: object) => ({ id, ...body })));
const deleteFlowQuestion = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/roles", () => ({ requireRole }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/flow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flow")>();
  return { ...actual, updateFlowQuestion, deleteFlowQuestion };
});

const { PATCH, DELETE } = await import("./route");

function patch(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  const req = new Request(`http://localhost/api/admin/flow/questions/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return [req, { params: Promise.resolve({ id }) }];
}

beforeEach(() => {
  requireRole.mockReset();
  updateFlowQuestion.mockClear();
  deleteFlowQuestion.mockClear();
});

describe("PATCH /api/admin/flow/questions/[id] authorization", () => {
  it.each([
    ["showWhen", { showWhen: { v: 1, when: { type: "answered", questionKey: "life-stage" } } }],
    ["prompt", { prompt: "New prompt text" }],
  ])("not signed in: %s edit rejected with 401, never reaches the write", async (_label, body) => {
    requireRole.mockResolvedValue({ ok: false, status: 401 });
    const [req, ctx] = patch("q1", body);
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(updateFlowQuestion).not.toHaveBeenCalled();
  });

  it.each([
    ["showWhen", { showWhen: { v: 1, when: { type: "answered", questionKey: "life-stage" } } }],
    ["prompt", { prompt: "New prompt text" }],
  ])("signed in, non-admin: %s edit rejected with 403, never reaches the write", async (_label, body) => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });
    const [req, ctx] = patch("q1", body);
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(updateFlowQuestion).not.toHaveBeenCalled();
  });

  it("admin: a showWhen edit is applied identically to any other field edit", async () => {
    requireRole.mockResolvedValue({ ok: true, userId: "u1", role: "admin" });
    const showWhen = { v: 1, when: { type: "answered", questionKey: "life-stage" } };
    const [req, ctx] = patch("q1", { showWhen });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(updateFlowQuestion).toHaveBeenCalledTimes(1);
    expect(updateFlowQuestion).toHaveBeenCalledWith("q1", { showWhen });
  });

  it("admin with a malformed showWhen gets a 400 from the real zod schema, not a 401/403", async () => {
    requireRole.mockResolvedValue({ ok: true, userId: "u1", role: "admin" });
    const [req, ctx] = patch("q1", { showWhen: { not: "a valid condition" } });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    expect(updateFlowQuestion).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/flow/questions/[id] authorization", () => {
  it("not signed in is rejected with 401 and never deletes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 401 });
    const [req, ctx] = patch("q1", undefined);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(401);
    expect(deleteFlowQuestion).not.toHaveBeenCalled();
  });

  it("admin deletes successfully", async () => {
    requireRole.mockResolvedValue({ ok: true, userId: "u1", role: "admin" });
    const [req, ctx] = patch("q1", undefined);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(deleteFlowQuestion).toHaveBeenCalledWith("q1");
  });
});
