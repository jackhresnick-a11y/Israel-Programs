import { describe, it, expect, vi, beforeEach } from "vitest";

// Style A (hoisted in-memory Prisma fake), same precedent as
// lib/programPrivateFields.test.ts. listProgramTranscripts feeds
// components/admin/TranscriptsManager.tsx's initial props directly -- per CLAUDE.md's
// "Watch what you pass to client components" rule, the full transcript text must never
// be among those props, only the derived wordCount/preview.
const { fakePrisma, resetDb, seedProgram } = vi.hoisted(() => {
  const db = { programs: [] as Record<string, unknown>[] };

  const fakePrisma = {
    program: {
      findMany: async (args: { where?: { videoTranscript?: { not: null } } }) => {
        const requireTranscript = args.where?.videoTranscript?.not === null;
        return db.programs.filter((p) => (requireTranscript ? p.videoTranscript !== null : true));
      },
    },
  };

  return {
    fakePrisma,
    resetDb: () => {
      db.programs = [];
    },
    seedProgram: (overrides: Record<string, unknown> = {}) => {
      db.programs.push({
        id: "prog_1",
        slug: "aish-hatorah",
        name: "Aish HaTorah",
        videoTranscript: null,
        updatedAt: new Date("2026-08-01T00:00:00Z"),
        ...overrides,
      });
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const { listProgramTranscripts } = await import("@/lib/transcripts");

beforeEach(() => {
  resetDb();
});

const SECRET_TAIL_MARKER = "SECRET_TAIL_MARKER_do-not-leak";

describe("listProgramTranscripts", () => {
  it("only includes programs with a non-null transcript", async () => {
    seedProgram({ id: "p1", slug: "has-transcript", videoTranscript: "some text" });
    seedProgram({ id: "p2", slug: "no-transcript", videoTranscript: null });

    const rows = await listProgramTranscripts();

    expect(rows.map((r) => r.slug)).toEqual(["has-transcript"]);
  });

  it("never returns the full transcript text -- only a derived wordCount and a preview capped at 200 chars", async () => {
    const fullText = "a".repeat(300) + " " + SECRET_TAIL_MARKER;
    seedProgram({ id: "p1", slug: "long-transcript", videoTranscript: fullText });

    const rows = await listProgramTranscripts();

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("videoTranscript");
    expect(rows[0].preview.length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(rows)).not.toContain(SECRET_TAIL_MARKER);
    expect(rows[0].wordCount).toBe(2);
  });

  it("computes wordCount and preview correctly for a short transcript", async () => {
    seedProgram({ id: "p1", slug: "short", videoTranscript: "one two three" });

    const rows = await listProgramTranscripts();

    expect(rows[0].wordCount).toBe(3);
    expect(rows[0].preview).toBe("one two three");
  });
});
