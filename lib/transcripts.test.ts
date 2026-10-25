import { describe, it, expect, vi, beforeEach } from "vitest";

// Style A (hoisted in-memory Prisma fake), same precedent as
// lib/programPrivateFields.test.ts. listProgramTranscripts feeds
// components/admin/TranscriptsManager.tsx's initial props directly -- per CLAUDE.md's
// "Watch what you pass to client components" rule, the full transcript text must never
// be among those props, only the derived wordCount/preview.
const { fakePrisma, resetDb, seedProgram, seedTranscript, seedBrief, snapshot } = vi.hoisted(() => {
  type ProgramRow = { id: string; slug: string; name: string };
  type TranscriptRow = {
    id: string;
    programId: string;
    filename: string;
    text: string;
    sourceUrl: string | null;
    createdAt: Date;
  };
  type BriefRow = {
    id: string;
    programId: string;
    status: string;
    needsRegeneration: boolean;
    insufficient: boolean;
    insufficientAt: Date | null;
  };

  const db = { programs: [] as ProgramRow[], transcripts: [] as TranscriptRow[], briefs: [] as BriefRow[] };
  let nextId = 1;

  const transcriptTable = {
    findMany: async (args: { where?: { programId?: string }; select?: unknown; orderBy?: unknown }) => {
      let rows = db.transcripts;
      if (args.where?.programId) rows = rows.filter((t) => t.programId === args.where!.programId);
      return [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
    findUnique: async (args: { where: { id: string } }) => {
      const row = db.transcripts.find((t) => t.id === args.where.id);
      if (!row) return null;
      const program = db.programs.find((p) => p.id === row.programId)!;
      return { ...row, program: { slug: program.slug, name: program.name } };
    },
    update: async (args: { where: { id: string }; data: { text: string } }) => {
      const row = db.transcripts.find((t) => t.id === args.where.id);
      if (!row) {
        const err: Error & { code?: string } = new Error("not found");
        err.code = "P2025";
        throw err;
      }
      row.text = args.data.text;
      return row;
    },
    delete: async (args: { where: { id: string } }) => {
      const idx = db.transcripts.findIndex((t) => t.id === args.where.id);
      if (idx === -1) {
        const err: Error & { code?: string } = new Error("not found");
        err.code = "P2025";
        throw err;
      }
      const [row] = db.transcripts.splice(idx, 1);
      return row;
    },
    create: async (args: { data: { programId: string; filename: string; text: string; sourceUrl: string | null } }) => {
      const row: TranscriptRow = { id: `tr_${nextId++}`, createdAt: new Date(), ...args.data };
      db.transcripts.push(row);
      return row;
    },
  };

  const programTable = {
    findMany: async (args: {
      where?: { slug?: { in: string[] }; transcripts?: { some: object } };
      select?: unknown;
      orderBy?: unknown;
    }) => {
      let rows = db.programs;
      if (args.where?.slug) rows = rows.filter((p) => args.where!.slug!.in.includes(p.slug));
      if (args.where?.transcripts) {
        const programIdsWithTranscripts = new Set(db.transcripts.map((t) => t.programId));
        rows = rows.filter((p) => programIdsWithTranscripts.has(p.id));
      }
      const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
      return sorted.map((p) => ({
        ...p,
        transcripts: db.transcripts
          .filter((t) => t.programId === p.id)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      }));
    },
  };

  const programBriefTable = {
    updateMany: async (args: {
      where: { programId: { in: string[] }; status: { not: string } };
      data: { needsRegeneration: boolean; insufficient: boolean; insufficientAt: null };
    }) => {
      let count = 0;
      for (const brief of db.briefs) {
        if (args.where.programId.in.includes(brief.programId) && brief.status !== args.where.status.not) {
          brief.needsRegeneration = args.data.needsRegeneration;
          brief.insufficient = args.data.insufficient;
          brief.insufficientAt = args.data.insufficientAt;
          count++;
        }
      }
      return { count };
    },
  };

  const fakePrisma = {
    program: programTable,
    transcript: transcriptTable,
    programBrief: programBriefTable,
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
    seedProgram: (overrides: Partial<ProgramRow> & { id: string }) => {
      db.programs.push({ slug: overrides.id, name: overrides.id, ...overrides });
    },
    seedTranscript: (overrides: Partial<TranscriptRow> & { id: string; programId: string }) => {
      db.transcripts.push({
        filename: `${overrides.id}.txt`,
        text: "text",
        sourceUrl: null,
        createdAt: new Date("2026-08-01T00:00:00Z"),
        ...overrides,
      });
    },
    seedBrief: (overrides: Partial<BriefRow> & { id: string; programId: string }) => {
      db.briefs.push({
        status: "DRAFT",
        needsRegeneration: false,
        insufficient: false,
        insufficientAt: null,
        ...overrides,
      });
    },
    snapshot: () => JSON.parse(JSON.stringify(db)),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const { listProgramTranscripts, saveTranscriptsBulk, UnknownProgramSlugsError } = await import("@/lib/transcripts");

beforeEach(() => {
  resetDb();
});

const SECRET_TAIL_MARKER = "SECRET_TAIL_MARKER_do-not-leak";

describe("listProgramTranscripts", () => {
  it("only includes programs with at least one transcript, grouped", async () => {
    seedProgram({ id: "p1", slug: "has-transcript", name: "Has Transcript" });
    seedTranscript({ id: "t1", programId: "p1", text: "some text" });
    seedProgram({ id: "p2", slug: "no-transcript", name: "No Transcript" });

    const rows = await listProgramTranscripts();

    expect(rows.map((r) => r.slug)).toEqual(["has-transcript"]);
    expect(rows[0].transcripts).toHaveLength(1);
  });

  it("never returns the full transcript text -- only a derived wordCount and a preview capped at 200 chars", async () => {
    const fullText = "a".repeat(300) + " " + SECRET_TAIL_MARKER;
    seedProgram({ id: "p1", slug: "long-transcript", name: "Long" });
    seedTranscript({ id: "t1", programId: "p1", text: fullText });

    const rows = await listProgramTranscripts();

    expect(rows).toHaveLength(1);
    expect(rows[0].transcripts[0]).not.toHaveProperty("text");
    expect(rows[0].transcripts[0].preview.length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(rows)).not.toContain(SECRET_TAIL_MARKER);
    expect(rows[0].transcripts[0].wordCount).toBe(2);
  });

  it("a program with several transcripts lists them all, oldest first", async () => {
    seedProgram({ id: "p1", slug: "multi", name: "Multi" });
    seedTranscript({ id: "t2", programId: "p1", filename: "multi--2.txt", text: "b", createdAt: new Date("2026-08-02") });
    seedTranscript({ id: "t1", programId: "p1", filename: "multi--1.txt", text: "a", createdAt: new Date("2026-08-01") });

    const rows = await listProgramTranscripts();

    expect(rows[0].transcripts.map((t) => t.filename)).toEqual(["multi--1.txt", "multi--2.txt"]);
  });
});

describe("saveTranscriptsBulk", () => {
  it("throws UnknownProgramSlugsError for a slug with no matching program", async () => {
    await expect(
      saveTranscriptsBulk([{ slug: "no-such-program", filename: "x.txt", text: "hi" }])
    ).rejects.toThrow(UnknownProgramSlugsError);
  });

  it("a second upload for the same slug ADDS a transcript rather than overwriting the first", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah", name: "Aish HaTorah" });

    await saveTranscriptsBulk([{ slug: "aish-hatorah", filename: "aish-hatorah--1.txt", text: "first" }]);
    await saveTranscriptsBulk([{ slug: "aish-hatorah", filename: "aish-hatorah--2.txt", text: "second" }]);

    const rows = await listProgramTranscripts();
    expect(rows[0].transcripts).toHaveLength(2);
    expect(rows[0].transcripts.map((t) => t.filename).sort()).toEqual([
      "aish-hatorah--1.txt",
      "aish-hatorah--2.txt",
    ]);
  });

  it("a single batch can insert several transcripts for the same slug at once", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah", name: "Aish HaTorah" });

    const result = await saveTranscriptsBulk([
      { slug: "aish-hatorah", filename: "aish-hatorah--1.txt", text: "first" },
      { slug: "aish-hatorah", filename: "aish-hatorah--2.txt", text: "second" },
    ]);

    expect(result.saved).toBe(2);
    const rows = await listProgramTranscripts();
    expect(rows[0].transcripts).toHaveLength(2);
  });

  it("flags every non-ARCHIVED brief for the affected program with needsRegeneration, and clears insufficient", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah", name: "Aish HaTorah" });
    seedBrief({ id: "b1", programId: "p1", status: "DRAFT", insufficient: true, insufficientAt: new Date() });
    seedBrief({ id: "b2", programId: "p1", status: "PUBLISHED" });
    seedBrief({ id: "b3", programId: "p1", status: "ARCHIVED" });

    await saveTranscriptsBulk([{ slug: "aish-hatorah", filename: "aish-hatorah--1.txt", text: "first" }]);

    const db = snapshot();
    const b1 = db.briefs.find((b: { id: string }) => b.id === "b1");
    const b2 = db.briefs.find((b: { id: string }) => b.id === "b2");
    const b3 = db.briefs.find((b: { id: string }) => b.id === "b3");
    expect(b1.needsRegeneration).toBe(true);
    expect(b1.insufficient).toBe(false);
    expect(b1.insufficientAt).toBeNull();
    expect(b2.needsRegeneration).toBe(true);
    // ARCHIVED briefs are untouched -- a retired slot shouldn't be resurrected by a new upload.
    expect(b3.needsRegeneration).toBe(false);
  });

  it("does not touch a different program's briefs", async () => {
    seedProgram({ id: "p1", slug: "aish-hatorah", name: "Aish HaTorah" });
    seedProgram({ id: "p2", slug: "other-program", name: "Other" });
    seedBrief({ id: "b1", programId: "p2", status: "DRAFT" });

    await saveTranscriptsBulk([{ slug: "aish-hatorah", filename: "aish-hatorah--1.txt", text: "first" }]);

    const db = snapshot();
    expect(db.briefs.find((b: { id: string }) => b.id === "b1").needsRegeneration).toBe(false);
  });
});
