import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_TRANSCRIPT_CHARS } from "@/lib/transcriptsShared";

// Style A (hoisted in-memory Prisma fake + dynamic import after vi.mock), same
// precedent as lib/programPrivateFields.test.ts -- this route's whole point is a
// server-side re-check against the live DB (unknown slug), so the test needs a fake
// that actually models program.findMany/transcript.create/programBrief.updateMany/
// $transaction, not just a mocked lib/ boundary.
const { fakePrisma, resetDb, seedProgram, getTranscripts } = vi.hoisted(() => {
  type ProgramRow = { id: string; slug: string };
  type TranscriptRow = { id: string; programId: string; filename: string; text: string; sourceUrl: string | null };

  const db = { programs: [] as ProgramRow[], transcripts: [] as TranscriptRow[], briefs: [] as unknown[] };
  let nextId = 1;

  const fakePrisma = {
    program: {
      findMany: async (args: { where?: { slug?: { in?: string[] } } }) => {
        const slugs = args.where?.slug?.in;
        return db.programs.filter((p) => !slugs || slugs.includes(p.slug));
      },
    },
    transcript: {
      create: async (args: { data: { programId: string; filename: string; text: string; sourceUrl: string | null } }) => {
        const row: TranscriptRow = { id: `tr_${nextId++}`, ...args.data };
        db.transcripts.push(row);
        return row;
      },
    },
    programBrief: {
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  return {
    fakePrisma,
    resetDb: () => {
      db.programs = [];
      db.transcripts = [];
      db.briefs = [];
      nextId = 1;
    },
    seedProgram: (overrides: ProgramRow) => {
      db.programs.push(overrides);
    },
    getTranscripts: () => db.transcripts,
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

    const res = await POST(post({ entries: [{ slug: "aish-hatorah", filename: "aish-hatorah.txt", text: "hello" }] }));

    expect(res.status).toBe(403);
    expect(getTranscripts()).toEqual([]);
  });
});

describe("POST /api/admin/transcripts -- unknown slug", () => {
  it("rejects the whole batch with 400 and writes nothing when a slug matches no program", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah" });

    const res = await POST(
      post({
        entries: [
          { slug: "aish-hatorah", filename: "aish-hatorah.txt", text: "hello" },
          { slug: "no-such-program", filename: "no-such-program.txt", text: "world" },
        ],
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.slugs).toEqual(["no-such-program"]);
    expect(getTranscripts()).toEqual([]);
  });
});

describe("POST /api/admin/transcripts -- append-only, never an overwrite", () => {
  it("a slug with an existing transcript still succeeds, adding a second row rather than requiring confirmation", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah" });
    await POST(post({ entries: [{ slug: "aish-hatorah", filename: "aish-hatorah--1.txt", text: "existing text" }] }));

    const res = await POST(post({ entries: [{ slug: "aish-hatorah", filename: "aish-hatorah--2.txt", text: "new text" }] }));

    expect(res.status).toBe(200);
    expect(getTranscripts()).toHaveLength(2);
    expect(getTranscripts().map((t) => t.text).sort()).toEqual(["existing text", "new text"]);
  });

  it("stores an optional sourceUrl per transcript", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah" });

    const res = await POST(
      post({
        entries: [
          { slug: "aish-hatorah", filename: "aish-hatorah.txt", text: "hi", sourceUrl: "https://example.com/video" },
        ],
      })
    );

    expect(res.status).toBe(200);
    expect(getTranscripts()[0].sourceUrl).toBe("https://example.com/video");
  });
});

describe("POST /api/admin/transcripts -- length cap", () => {
  it("rejects text over MAX_TRANSCRIPT_CHARS with 400 and writes nothing", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah" });
    const tooLong = "a".repeat(MAX_TRANSCRIPT_CHARS + 1);

    const res = await POST(post({ entries: [{ slug: "aish-hatorah", filename: "aish-hatorah.txt", text: tooLong }] }));

    expect(res.status).toBe(400);
    expect(getTranscripts()).toEqual([]);
  });
});
