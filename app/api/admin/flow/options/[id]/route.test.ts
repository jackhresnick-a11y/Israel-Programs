import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * showWhen coverage for the option-level rule (FlowOption.showWhen), mirroring
 * app/api/admin/flow/questions/[id]/route.test.ts's showWhen assertions for the
 * question-level field: same admin gate, same real flowConditionSchema doing the
 * validation, same "malformed rule is a 400 from zod, never reaches the write" shape.
 * @/lib/flow is only partially mocked -- flowConditionSchema stays real (imported from
 * @/lib/flowShared, no Prisma dependency) so the route's zod validation is exercised
 * for real, and only updateFlowOption/deleteFlowOption (the Prisma-backed writes) are
 * stubbed.
 */
const requireRole = vi.hoisted(() => vi.fn());
const updateFlowOption = vi.hoisted(() => vi.fn(async (id: string, body: object) => ({ id, ...body })));
const deleteFlowOption = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/roles", () => ({ requireRole }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/flow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flow")>();
  return { ...actual, updateFlowOption, deleteFlowOption };
});

const { PATCH, DELETE } = await import("./route");

function patch(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  const req = new Request(`http://localhost/api/admin/flow/options/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return [req, { params: Promise.resolve({ id }) }];
}

beforeEach(() => {
  requireRole.mockReset();
  updateFlowOption.mockClear();
  deleteFlowOption.mockClear();
});

describe("PATCH /api/admin/flow/options/[id] showWhen", () => {
  it("not signed in: rejected with 401, never reaches the write", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 401 });
    const [req, ctx] = patch("opt1", { showWhen: { v: 1, when: { type: "answered", questionKey: "life-stage" } } });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(401);
    expect(updateFlowOption).not.toHaveBeenCalled();
  });

  it("admin: a valid showWhen edit is applied identically to any other field edit", async () => {
    requireRole.mockResolvedValue({ ok: true, userId: "u1", role: "admin" });
    const showWhen = { v: 1, when: { type: "answered", questionKey: "life-stage" } };
    const [req, ctx] = patch("opt1", { showWhen });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(updateFlowOption).toHaveBeenCalledTimes(1);
    expect(updateFlowOption).toHaveBeenCalledWith("opt1", { showWhen });
  });

  it("admin: showWhen: null (clearing the rule) is passed through", async () => {
    requireRole.mockResolvedValue({ ok: true, userId: "u1", role: "admin" });
    const [req, ctx] = patch("opt1", { showWhen: null });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(updateFlowOption).toHaveBeenCalledWith("opt1", { showWhen: null });
  });

  it("admin with a malformed showWhen gets a 400 from the real zod schema, never reaches updateFlowOption", async () => {
    requireRole.mockResolvedValue({ ok: true, userId: "u1", role: "admin" });
    const [req, ctx] = patch("opt1", { showWhen: { not: "a valid condition" } });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    expect(updateFlowOption).not.toHaveBeenCalled();
  });

  it("a thrown guard error (e.g. forward-reference) surfaces as 400, not 500", async () => {
    requireRole.mockResolvedValue({ ok: true, userId: "u1", role: "admin" });
    updateFlowOption.mockRejectedValueOnce(new Error("Invalid condition: references \"later-question\", which isn't ordered before this question"));
    const [req, ctx] = patch("opt1", { showWhen: { v: 1, when: { type: "answered", questionKey: "later-question" } } });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/isn't ordered before/);
  });
});

describe("DELETE /api/admin/flow/options/[id] authorization", () => {
  it("not signed in is rejected with 401 and never deletes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 401 });
    const [req, ctx] = patch("opt1", undefined);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(401);
    expect(deleteFlowOption).not.toHaveBeenCalled();
  });

  it("admin deletes successfully", async () => {
    requireRole.mockResolvedValue({ ok: true, userId: "u1", role: "admin" });
    const [req, ctx] = patch("opt1", undefined);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(deleteFlowOption).toHaveBeenCalledWith("opt1");
  });
});
