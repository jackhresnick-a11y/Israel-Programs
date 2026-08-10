import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Archiving a poll review must be moderator-gated server-side (not just hidden in the
 * UI), must never write when unauthorized, and must revalidate the program page on
 * success -- same authorization-first pattern as
 * app/api/admin/partner-links/route.test.ts.
 */
const requireRole = vi.hoisted(() => vi.fn());
const archivePollReview = vi.hoisted(() => vi.fn());
const revalidateProgram = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/roles", () => ({ requireRole }));
vi.mock("@/lib/pollReviews", () => ({ archivePollReview }));
vi.mock("@/lib/revalidate", () => ({ revalidateProgram }));

const { POST } = await import("./route");

function post(body?: unknown): Request {
  return new Request("http://localhost/api/admin/polls/reviews/review_1/archive", {
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
  archivePollReview.mockReset();
  revalidateProgram.mockClear();
});

describe("POST /api/admin/polls/reviews/[id]/archive", () => {
  it("rejects an unauthenticated caller and never writes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 401 });
    const res = await POST(post(), params());
    expect(res.status).toBe(401);
    expect(archivePollReview).not.toHaveBeenCalled();
    expect(revalidateProgram).not.toHaveBeenCalled();
  });

  it("rejects a signed-in non-moderator and never writes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });
    const res = await POST(post(), params());
    expect(res.status).toBe(403);
    expect(archivePollReview).not.toHaveBeenCalled();
  });

  it("moderator: archives and revalidates the program page", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    archivePollReview.mockResolvedValue({ ok: true, programId: "prog_1" });
    const res = await POST(post({ note: "spam" }), params("review_1"));
    expect(res.status).toBe(200);
    expect(archivePollReview).toHaveBeenCalledWith("review_1", "mod_1", "spam");
    expect(revalidateProgram).toHaveBeenCalledTimes(1);
    expect(revalidateProgram).toHaveBeenCalledWith("prog_1");
  });

  it("gate failure (e.g. not currently approved) → 400, no revalidate", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    archivePollReview.mockResolvedValue({ ok: false, reason: "Only an approved review can be archived" });
    const res = await POST(post(), params());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Only an approved review can be archived");
    expect(revalidateProgram).not.toHaveBeenCalled();
  });
});
