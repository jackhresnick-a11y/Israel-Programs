import { describe, it, expect, beforeEach, vi } from "vitest";

const requireRole = vi.hoisted(() => vi.fn());
const archiveStandaloneReview = vi.hoisted(() => vi.fn());
const revalidateProgram = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/roles", () => ({ requireRole }));
vi.mock("@/lib/reviews", () => ({ archiveStandaloneReview }));
vi.mock("@/lib/revalidate", () => ({ revalidateProgram }));

const { POST } = await import("./route");

function post(body?: unknown): Request {
  return new Request("http://localhost/api/admin/reviews/review_1/archive", {
    method: "POST",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id = "review_1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireRole.mockReset();
  archiveStandaloneReview.mockReset();
  revalidateProgram.mockClear();
});

describe("POST /api/admin/reviews/[id]/archive", () => {
  it("rejects a non-moderator and never writes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });
    const res = await POST(post(), params());
    expect(res.status).toBe(403);
    expect(archiveStandaloneReview).not.toHaveBeenCalled();
  });

  it("moderator: archives and revalidates the program page", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    archiveStandaloneReview.mockResolvedValue({ ok: true, programId: "prog_1" });
    const res = await POST(post({ note: "spam" }), params("review_1"));
    expect(res.status).toBe(200);
    expect(archiveStandaloneReview).toHaveBeenCalledWith("review_1", "mod_1", "spam");
    expect(revalidateProgram).toHaveBeenCalledWith("prog_1");
  });

  it("gate failure → 400, no revalidate", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    archiveStandaloneReview.mockResolvedValue({ ok: false, reason: "Only a published review can be archived" });
    const res = await POST(post(), params());
    expect(res.status).toBe(400);
    expect(revalidateProgram).not.toHaveBeenCalled();
  });
});
