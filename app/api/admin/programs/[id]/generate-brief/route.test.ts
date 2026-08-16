import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.hoisted(() => vi.fn());
vi.mock("@/lib/roles", () => ({ requireRole }));

const mockGetProgramVideoTranscript = vi.hoisted(() => vi.fn());
vi.mock("@/lib/programs", () => ({ getProgramVideoTranscript: (id: string) => mockGetProgramVideoTranscript(id) }));

const mockGenerateBrief = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai", () => ({ getAIProvider: () => ({ generateBrief: (t: string) => mockGenerateBrief(t) }) }));

const mockCheckRateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args) }));

const { POST } = await import("./route");

function post(): Request {
  return new Request("http://localhost/api/admin/programs/prog_1/generate-brief", { method: "POST" });
}

function makeParams(id = "prog_1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ ok: true, userId: "admin_1", role: "admin" });
  mockCheckRateLimit.mockReturnValue(true);
  mockGetProgramVideoTranscript.mockResolvedValue("Welcome to our program in Jerusalem, four months long...");
  mockGenerateBrief.mockResolvedValue("Located in Jerusalem. Four-month program. Hebrew and English instruction.");
});

describe("POST /api/admin/programs/[id]/generate-brief -- authorization", () => {
  it("rejects an unauthenticated caller server-side without calling the provider", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 401 });

    const res = await POST(post(), makeParams());

    expect(res.status).toBe(401);
    expect(mockGenerateBrief).not.toHaveBeenCalled();
    expect(mockGetProgramVideoTranscript).not.toHaveBeenCalled();
  });

  it("rejects a non-admin caller (e.g. moderator) with 403", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });

    const res = await POST(post(), makeParams());

    expect(res.status).toBe(403);
    expect(mockGenerateBrief).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/programs/[id]/generate-brief -- success", () => {
  it("returns the provider's draft brief without writing anything", async () => {
    const res = await POST(post(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ brief: "Located in Jerusalem. Four-month program. Hebrew and English instruction." });
    expect(mockGetProgramVideoTranscript).toHaveBeenCalledWith("prog_1");
  });
});

describe("POST /api/admin/programs/[id]/generate-brief -- empty transcript", () => {
  it("400s and never calls the provider when the program has no transcript (null)", async () => {
    mockGetProgramVideoTranscript.mockResolvedValue(null);

    const res = await POST(post(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no transcript/i);
    expect(mockGenerateBrief).not.toHaveBeenCalled();
  });

  it("400s on a whitespace-only transcript", async () => {
    mockGetProgramVideoTranscript.mockResolvedValue("   \n  ");

    const res = await POST(post(), makeParams());

    expect(res.status).toBe(400);
    expect(mockGenerateBrief).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/programs/[id]/generate-brief -- provider failure", () => {
  it("surfaces a 502 with a client-facing message when the provider rejects", async () => {
    mockGenerateBrief.mockRejectedValue(new Error("upstream timeout"));

    const res = await POST(post(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBeTruthy();
  });
});

describe("POST /api/admin/programs/[id]/generate-brief -- rate limiting", () => {
  it("429s and never calls the provider once the per-admin limit is hit", async () => {
    mockCheckRateLimit.mockReturnValue(false);

    const res = await POST(post(), makeParams());

    expect(res.status).toBe(429);
    expect(mockGenerateBrief).not.toHaveBeenCalled();
  });
});
