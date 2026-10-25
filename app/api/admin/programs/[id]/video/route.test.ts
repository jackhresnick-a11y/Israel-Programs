import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * This write path must enforce admin authorization SERVER-SIDE (hiding the admin UI is
 * not enough), and must reject a non-http(s) videoUrl/videoCreditUrl at write time rather
 * than store it. Same shape as app/api/admin/partner-links/route.test.ts -- mock the role
 * gate and the lib/programs.ts write so the route runs without a real session or database.
 */
const requireRole = vi.hoisted(() => vi.fn());
const setProgramVideoFields = vi.hoisted(() => vi.fn(async () => ({})));
const revalidateProgram = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/roles", () => ({ requireRole }));
vi.mock("@/lib/programs", () => ({ setProgramVideoFields }));
vi.mock("@/lib/revalidate", () => ({ revalidateProgram }));

const { PATCH } = await import("./route");

function patch(body: unknown): Request {
  return new Request("http://localhost/api/admin/programs/prog_1/video", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "prog_1" });

beforeEach(() => {
  requireRole.mockReset();
  setProgramVideoFields.mockClear();
  revalidateProgram.mockClear();
});

describe("PATCH /api/admin/programs/[id]/video authorization", () => {
  it("rejects a non-admin server-side and never writes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });
    const res = await PATCH(patch({ videoUrl: null, videoCredit: null, videoCreditUrl: null }), { params });
    expect(res.status).toBe(403);
    expect(setProgramVideoFields).not.toHaveBeenCalled();
    expect(requireRole).toHaveBeenCalledWith("admin");
  });
});

describe("PATCH /api/admin/programs/[id]/video -- videoCredit/videoCreditUrl", () => {
  beforeEach(() => {
    requireRole.mockResolvedValue({ ok: true, status: 200 });
  });

  it("admin with a valid credit + credit url writes once", async () => {
    const res = await PATCH(
      patch({
        videoUrl: "https://www.instagram.com/reel/abc123/",
        videoCredit: "@handle",
        videoCreditUrl: "https://instagram.com/handle",
      }),
      { params }
    );
    expect(res.status).toBe(200);
    expect(setProgramVideoFields).toHaveBeenCalledTimes(1);
    expect(setProgramVideoFields).toHaveBeenCalledWith("prog_1", {
      videoUrl: "https://www.instagram.com/reel/abc123/",
      videoCredit: "@handle",
      videoCreditUrl: "https://instagram.com/handle",
    });
    expect(revalidateProgram).toHaveBeenCalledWith("prog_1");
  });

  it("a non-http(s) videoCreditUrl is rejected with 400 and never writes", async () => {
    const res = await PATCH(
      patch({ videoUrl: null, videoCredit: "@handle", videoCreditUrl: "javascript:alert(1)" }),
      { params }
    );
    expect(res.status).toBe(400);
    expect(setProgramVideoFields).not.toHaveBeenCalled();
  });

  it("blank videoCredit/videoCreditUrl are stored as null, not empty strings", async () => {
    const res = await PATCH(patch({ videoUrl: null, videoCredit: "  ", videoCreditUrl: null }), { params });
    expect(res.status).toBe(200);
    expect(setProgramVideoFields).toHaveBeenCalledWith("prog_1", {
      videoUrl: null,
      videoCredit: null,
      videoCreditUrl: null,
    });
  });

  it("no longer accepts videoTranscript/aiBrief -- extra fields in the body are simply ignored, not written", async () => {
    const res = await PATCH(
      patch({
        videoUrl: null,
        videoCredit: null,
        videoCreditUrl: null,
        videoTranscript: "some transcript text",
        aiBrief: "some brief",
      }),
      { params }
    );
    expect(res.status).toBe(200);
    expect(setProgramVideoFields).toHaveBeenCalledWith("prog_1", {
      videoUrl: null,
      videoCredit: null,
      videoCreditUrl: null,
    });
  });
});
