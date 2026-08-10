import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@/app/generated/prisma/client";

/**
 * DELETE /api/admin/polls/reviews/[id] -- the permanent hard-delete action. Mirrors the
 * error-mapping contract app/api/programs/[id]/route.ts's DELETE already established
 * (P2025 -> 404, P2003/23001-restrict-violation -> 409 with a readable message, else
 * 500), copied here since neither review table currently has an FK pointing at it --
 * the 409 branch is exercised with an injected error rather than a real constraint.
 */
const requireRole = vi.hoisted(() => vi.fn());
const approvePollReview = vi.hoisted(() => vi.fn());
const rejectPollReview = vi.hoisted(() => vi.fn());
const hardDeletePollReview = vi.hoisted(() => vi.fn());
const revalidateProgram = vi.hoisted(() => vi.fn(async () => {}));
const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/roles", () => ({ requireRole }));
vi.mock("@/lib/pollReviews", () => ({ approvePollReview, rejectPollReview, hardDeletePollReview }));
vi.mock("@/lib/revalidate", () => ({ revalidateProgram }));
vi.mock("@/lib/prisma", () => ({ prisma: { pollReview: { findUnique } } }));

const { DELETE } = await import("./route");

function del(): Request {
  return new Request("http://localhost/api/admin/polls/reviews/review_1", { method: "DELETE" });
}

function params(id = "review_1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireRole.mockReset();
  approvePollReview.mockReset();
  rejectPollReview.mockReset();
  hardDeletePollReview.mockReset();
  revalidateProgram.mockClear();
  findUnique.mockReset();
});

describe("DELETE /api/admin/polls/reviews/[id]", () => {
  it("rejects a non-moderator and never deletes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });
    const res = await DELETE(del(), params());
    expect(res.status).toBe(403);
    expect(hardDeletePollReview).not.toHaveBeenCalled();
  });

  it("moderator: deletes and revalidates the program page", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    hardDeletePollReview.mockResolvedValue({ programId: "prog_1" });
    const res = await DELETE(del(), params("review_1"));
    expect(res.status).toBe(200);
    expect(hardDeletePollReview).toHaveBeenCalledWith("review_1");
    expect(revalidateProgram).toHaveBeenCalledWith("prog_1");
  });

  it("missing review → 404, no revalidate", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    hardDeletePollReview.mockResolvedValue(null);
    const res = await DELETE(del(), params("missing"));
    expect(res.status).toBe(404);
    expect(revalidateProgram).not.toHaveBeenCalled();
  });

  it("P2025 thrown mid-delete → 404", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    hardDeletePollReview.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record not found", { code: "P2025", clientVersion: "7.8.0" })
    );
    const res = await DELETE(del(), params());
    expect(res.status).toBe(404);
  });

  it("P2003 (FK restrict) → 409 with a readable message", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    hardDeletePollReview.mockRejectedValue(
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
    hardDeletePollReview.mockRejectedValue(err);
    const res = await DELETE(del(), params());
    expect(res.status).toBe(409);
  });

  it("unknown error → 500", async () => {
    requireRole.mockResolvedValue({ ok: true, status: 200, userId: "mod_1" });
    hardDeletePollReview.mockRejectedValue(new Error("db exploded"));
    const res = await DELETE(del(), params());
    expect(res.status).toBe(500);
  });
});
