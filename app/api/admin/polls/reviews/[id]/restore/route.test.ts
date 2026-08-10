import { describe, it, expect, beforeEach, vi } from "vitest";

const requireRole = vi.hoisted(() => vi.fn());
const restorePollReview = vi.hoisted(() => vi.fn());
const revalidateProgram = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/roles", () => ({ requireRole }));
vi.mock("@/lib/pollReviews", () => ({ restorePollReview }));
vi.mock("@/lib/revalidate", () => ({ revalidateProgram }));

const { POST } = await import("./route");

function post(): Request {
  return new Request("http://localhost/api/admin/polls/reviews/review_1/restore", { method: "POST" });
}

function params(id = "review_1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireRole.mockReset();
  restorePollReview.mockReset();
  revalidateProgram.mockClear();
});

describe("POST /api/admin/polls/reviews/[id]/restore", () => {
  it("rejects a non-moderator and never writes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });
    const res = await POST(post(), params());
    expect(res.status).toBe(403);
    expect(restorePollReview).not.toHaveBeenCalled();
  });

  it("moderator: restores and revalidates the program page", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    restorePollReview.mockResolvedValue({ ok: true, programId: "prog_1" });
    const res = await POST(post(), params("review_1"));
    expect(res.status).toBe(200);
    expect(restorePollReview).toHaveBeenCalledWith("review_1", "mod_1");
    expect(revalidateProgram).toHaveBeenCalledWith("prog_1");
  });

  it("gate failure (parent response no longer counted) → 400, no revalidate", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    restorePollReview.mockResolvedValue({ ok: false, reason: "The parent response isn’t counted anymore" });
    const res = await POST(post(), params());
    expect(res.status).toBe(400);
    expect(revalidateProgram).not.toHaveBeenCalled();
  });
});
