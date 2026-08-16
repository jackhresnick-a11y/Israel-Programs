import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_TRANSCRIPT_CHARS } from "@/lib/transcriptsShared";

// Style A (hoisted in-memory Prisma fake + dynamic import after vi.mock), same
// precedent as lib/programPrivateFields.test.ts -- this route's whole point is a
// server-side re-check against the live DB (unknown slug, overwrite-without-confirm),
// so the test needs a fake that actually models program.findMany/update/$transaction,
// not just a mocked lib/ boundary.
const { fakePrisma, resetDb, seedProgram, getPrograms } = vi.hoisted(() => {
  const db = { programs: [] as { id: string; slug: string; videoTranscript: string | null }[] };

  const fakePrisma = {
    program: {
      findMany: async (args: { where?: { slug?: { in?: string[] } } }) => {
        const slugs = args.where?.slug?.in;
        return db.programs
          .filter((p) => !slugs || slugs.includes(p.slug))
          .map((p) => ({ id: p.id, slug: p.slug, videoTranscript: p.videoTranscript }));
      },
      update: async (args: { where: { id: string }; data: { videoTranscript: string | null } }) => {
        const row = db.programs.find((p) => p.id === args.where.id);
        if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
        row.videoTranscript = args.data.videoTranscript;
        return { ...row };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  return {
    fakePrisma,
    resetDb: () => {
      db.programs = [];
    },
    seedProgram: (overrides: { id: string; slug: string; videoTranscript?: string | null }) => {
      db.programs.push({ videoTranscript: null, ...overrides });
    },
    getPrograms: () => db.programs,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const requireRole = vi.hoisted(() => vi.fn());
vi.mock("@/lib/roles", () => ({ requireRole }));

const { POST } = await import("./route");

function post(body: unknown): Request {
  return new Request("http://localhost/api/admin/transcripts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetDb();
  requireRole.mockReset();
  requireRole.mockResolvedValue({ ok: true, status: 200 });
});

describe("POST /api/admin/transcripts authorization", () => {
  it("rejects a non-admin server-side and writes nothing", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });
    seedProgram({ id: "p1", slug: "aish-hatorah" });

    const res = await POST(post({ entries: [{ slug: "aish-hatorah", text: "hello" }], confirmOverwrite: false }));

    expect(res.status).toBe(403);
    expect(getPrograms()[0].videoTranscript).toBeNull();
  });
});

describe("POST /api/admin/transcripts -- unknown slug", () => {
  it("rejects the whole batch with 400 and writes nothing when a slug matches no program", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah" });

    const res = await POST(
      post({
        entries: [
          { slug: "aish-hatorah", text: "hello" },
          { slug: "no-such-program", text: "world" },
        ],
        confirmOverwrite: true,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.slugs).toEqual(["no-such-program"]);
    expect(getPrograms()[0].videoTranscript).toBeNull();
  });
});

describe("POST /api/admin/transcripts -- overwrite gate", () => {
  it("rejects with 409 and writes nothing when a slug already has a transcript and confirmOverwrite is false", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah", videoTranscript: "existing text" });

    const res = await POST(
      post({ entries: [{ slug: "aish-hatorah", text: "new text" }], confirmOverwrite: false })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.slugs).toEqual(["aish-hatorah"]);
    expect(getPrograms()[0].videoTranscript).toBe("existing text");
  });

  it("writes through when confirmOverwrite is true", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah", videoTranscript: "existing text" });

    const res = await POST(
      post({ entries: [{ slug: "aish-hatorah", text: "new text" }], confirmOverwrite: true })
    );

    expect(res.status).toBe(200);
    expect(getPrograms()[0].videoTranscript).toBe("new text");
  });

  it("never requires confirmation for a brand-new transcript", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah", videoTranscript: null });

    const res = await POST(
      post({ entries: [{ slug: "aish-hatorah", text: "first transcript" }], confirmOverwrite: false })
    );

    expect(res.status).toBe(200);
    expect(getPrograms()[0].videoTranscript).toBe("first transcript");
  });
});

describe("POST /api/admin/transcripts -- length cap", () => {
  it("rejects text over MAX_TRANSCRIPT_CHARS with 400 and writes nothing", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah" });
    const tooLong = "a".repeat(MAX_TRANSCRIPT_CHARS + 1);

    const res = await POST(post({ entries: [{ slug: "aish-hatorah", text: tooLong }], confirmOverwrite: false }));

    expect(res.status).toBe(400);
    expect(getPrograms()[0].videoTranscript).toBeNull();
  });
});
