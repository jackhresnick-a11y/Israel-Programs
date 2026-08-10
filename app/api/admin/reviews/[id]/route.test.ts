import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@/app/generated/prisma/client";

/**
 * DELETE /api/admin/reviews/[id] -- same contract as the PollReview counterpart (see
 * app/api/admin/polls/reviews/[id]/route.test.ts's doc comment).
 */
const requireRole = vi.hoisted(() => vi.fn());
const approveStandaloneReview = vi.hoisted(() => vi.fn());
const rejectStandaloneReview = vi.hoisted(() => vi.fn());
const hardDeleteStandaloneReview = vi.hoisted(() => vi.fn());
const revalidateProgram = vi.hoisted(() => vi.fn(async () => {}));
const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/roles", () => ({ requireRole }));
vi.mock("@/lib/reviews", () => ({ approveStandaloneReview, rejectStandaloneReview, hardDeleteStandaloneReview }));
vi.mock("@/lib/revalidate", () => ({ revalidateProgram }));
vi.mock("@/lib/prisma", () => ({ prisma: { review: { findUnique } } }));

const { DELETE } = await import("./route");

function del(): Request {
  return new Request("http://localhost/api/admin/reviews/review_1", { method: "DELETE" });
}

function params(id = "review_1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireRole.mockReset();
  approveStandaloneReview.mockReset();
  rejectStandaloneReview.mockReset();
  hardDeleteStandaloneReview.mockReset();
  revalidateProgram.mockClear();
  findUnique.mockReset();
});

describe("DELETE /api/admin/reviews/[id]", () => {
  it("rejects a non-moderator and never deletes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });
    const res = await DELETE(del(), params());
    expect(res.status).toBe(403);
    expect(hardDeleteStandaloneReview).not.toHaveBeenCalled();
  });

  it("moderator: deletes and revalidates the program page", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    hardDeleteStandaloneReview.mockResolvedValue({ programId: "prog_1" });
    const res = await DELETE(del(), params("review_1"));
    expect(res.status).toBe(200);
    expect(hardDeleteStandaloneReview).toHaveBeenCalledWith("review_1");
    expect(revalidateProgram).toHaveBeenCalledWith("prog_1");
  });

  it("missing review → 404, no revalidate", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    hardDeleteStandaloneReview.mockResolvedValue(null);
    const res = await DELETE(del(), params("missing"));
    expect(res.status).toBe(404);
    expect(revalidateProgram).not.toHaveBeenCalled();
  });

  it("P2025 thrown mid-delete → 404", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    hardDeleteStandaloneReview.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record not found", { code: "P2025", clientVersion: "7.8.0" })
    );
    const res = await DELETE(del(), params());
    expect(res.status).toBe(404);
  });

  it("P2003 (FK restrict) → 409 with a readable message", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    hardDeleteStandaloneReview.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", { code: "P2003", clientVersion: "7.8.0" })
    );
    const res = await DELETE(del(), params());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("unmapped 23001 restrict_violation (DriverAdapterError) → 409", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    const err = new Error("restrict_violation");
    err.name = "DriverAdapterError";
    (err as Error & { cause?: { code?: string } }).cause = { code: "23001" };
    hardDeleteStandaloneReview.mockRejectedValue(err);
    const res = await DELETE(del(), params());
    expect(res.status).toBe(409);
  });

  it("unknown error → 500", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    hardDeleteStandaloneReview.mockRejectedValue(new Error("db exploded"));
    const res = await DELETE(del(), params());
    expect(res.status).toBe(500);
  });
});
