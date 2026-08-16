import { describe, it, expect, vi, beforeEach } from "vitest";

// --- In-memory Prisma fake, honoring `omit` -----------------------------------
// Unlike app/api/programs/[id]/route.test.ts's fake (which never needs to model
// `omit`), this one implements it for real -- videoTranscript/transcriptTags must
// actually be dropped by the query, not just absent from what the fake happens to
// return, or these tests would pass for the wrong reason.
const { fakePrisma, resetDb, seedProgram, getLastFindUniqueArgs, getLastFindManyArgs } = vi.hoisted(() => {
  const db = { programs: [] as Record<string, unknown>[], seq: 0 };
  let lastFindUniqueArgs: unknown = null;
  let lastFindManyArgs: unknown = null;

  function applyOmit(row: Record<string, unknown>, omit?: Record<string, boolean>) {
    const result = { ...row };
    if (omit) {
      for (const [key, value] of Object.entries(omit)) {
        if (value) delete result[key];
      }
    }
    return result;
  }

  const fakePrisma = {
    program: {
      findUnique: async (args: { where: { slug: string }; omit?: Record<string, boolean> }) => {
        lastFindUniqueArgs = args;
        const row = db.programs.find((p) => p.slug === args.where.slug);
        if (!row) return null;
        return {
          ...applyOmit(row, args.omit),
          tags: row.tags ?? [],
          videos: row.videos ?? [],
          reviews: ((row.reviews as Record<string, unknown>[] | undefined) ?? []).filter(
            (r) => r.status === "PUBLISHED"
          ),
        };
      },
      findMany: async (args: {
        where?: { status?: string; slug?: { in?: string[] } };
        omit?: Record<string, boolean>;
      }) => {
        lastFindManyArgs = args;
        const slugsIn = args.where?.slug?.in;
        return db.programs
          .filter((p) => (args.where?.status ? p.status === args.where.status : true))
          .filter((p) => (slugsIn ? slugsIn.includes(p.slug as string) : true))
          .map((row) => ({
            ...applyOmit(row, args.omit),
            tags: row.tags ?? [],
            reviews: ((row.reviews as Record<string, unknown>[] | undefined) ?? []).filter(
              (r) => r.status === "PUBLISHED"
            ),
            _count: { references: 0, pollResponses: 0 },
          }));
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.programs.find((p) => p.id === args.where.id);
        if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
        Object.assign(row, args.data);
        return { ...applyOmit(row, { videoTranscript: true, transcriptTags: true }) };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  function seedProgram(overrides: Record<string, unknown> = {}) {
    db.seq += 1;
    const row = {
      id: `prog_${db.seq}`,
      name: "Test Program",
      slug: `test-program-${db.seq}`,
      description: "A description.",
      status: "PUBLISHED",
      durationType: "SUMMER",
      createdAt: new Date(),
      updatedAt: new Date(),
      videoUrl: null,
      videoTranscript: null,
      aiBrief: null,
      transcriptTags: [] as string[],
      tags: [] as unknown[],
      videos: [] as unknown[],
      reviews: [] as unknown[],
      ...overrides,
    };
    db.programs.push(row);
    return row;
  }

  return {
    fakePrisma,
    resetDb: () => {
      db.programs = [];
      db.seq = 0;
    },
    seedProgram,
    getLastFindUniqueArgs: () => lastFindUniqueArgs,
    getLastFindManyArgs: () => lastFindManyArgs,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const { getProgramBySlug, getProgramsBySlugs, listPrograms, toPublicProgram } = await import("@/lib/programs");
const { saveTranscriptsBulk } = await import("@/lib/transcripts");

beforeEach(() => {
  resetDb();
});

const SECRET_TRANSCRIPT = "SECRET RAW TRANSCRIPT do-not-leak-12345";

describe("Program private-field boundary (videoTranscript/transcriptTags)", () => {
  describe("getProgramBySlug", () => {
    it("queries with omit: { videoTranscript, transcriptTags } and the result carries neither field or text", async () => {
      seedProgram({
        slug: "prog-a",
        videoTranscript: SECRET_TRANSCRIPT,
        transcriptTags: ["staged-slug"],
        aiBrief: "A public brief.",
      });

      const result = await getProgramBySlug("prog-a");

      const args = getLastFindUniqueArgs() as { omit?: Record<string, boolean> };
      expect(args.omit).toEqual({ videoTranscript: true, transcriptTags: true });
      expect(result).not.toHaveProperty("videoTranscript");
      expect(result).not.toHaveProperty("transcriptTags");
      expect(JSON.stringify(result)).not.toContain(SECRET_TRANSCRIPT);
      // aiBrief is the one transcript-derived field that IS allowed through.
      expect(result?.aiBrief).toBe("A public brief.");
    });
  });

  describe("listPrograms", () => {
    it("queries with omit: { videoTranscript, transcriptTags } and every result carries neither field or text", async () => {
      seedProgram({
        slug: "prog-b",
        videoTranscript: SECRET_TRANSCRIPT,
        transcriptTags: ["staged-slug"],
      });

      const results = await listPrograms({});

      const args = getLastFindManyArgs() as { omit?: Record<string, boolean> };
      expect(args.omit).toEqual({ videoTranscript: true, transcriptTags: true });
      expect(results).toHaveLength(1);
      expect(results[0]).not.toHaveProperty("videoTranscript");
      expect(results[0]).not.toHaveProperty("transcriptTags");
      expect(JSON.stringify(results)).not.toContain(SECRET_TRANSCRIPT);
    });
  });

  describe("toPublicProgram", () => {
    it("strips videoTranscript/transcriptTags (independent of the query-layer omit) but keeps aiBrief/videoUrl", () => {
      const row = {
        id: "prog_x",
        name: "X",
        adminNote: "note",
        contactEmailSource: "src",
        outreachCategory: "cat",
        videoTranscript: SECRET_TRANSCRIPT,
        transcriptTags: ["staged-slug"],
        aiBrief: "A public brief.",
        videoUrl: "https://example.com/video",
      };

      const result = toPublicProgram(row);

      expect(result).not.toHaveProperty("videoTranscript");
      expect(result).not.toHaveProperty("transcriptTags");
      expect(result).not.toHaveProperty("adminNote");
      expect(result).not.toHaveProperty("contactEmailSource");
      expect(result).not.toHaveProperty("outreachCategory");
      expect(JSON.stringify(result)).not.toContain(SECRET_TRANSCRIPT);
      expect(result.aiBrief).toBe("A public brief.");
      expect(result.videoUrl).toBe("https://example.com/video");
    });
  });

  describe("getProgramsBySlugs", () => {
    it("queries with omit: { videoTranscript, transcriptTags } and every result carries neither field or text", async () => {
      seedProgram({
        slug: "prog-c",
        status: "PUBLISHED",
        videoTranscript: SECRET_TRANSCRIPT,
        transcriptTags: ["staged-slug"],
      });

      const results = await getProgramsBySlugs(["prog-c"]);

      const args = getLastFindManyArgs() as { omit?: Record<string, boolean> };
      expect(args.omit).toEqual({ videoTranscript: true, transcriptTags: true });
      expect(results).toHaveLength(1);
      expect(results[0]).not.toHaveProperty("videoTranscript");
      expect(results[0]).not.toHaveProperty("transcriptTags");
      expect(JSON.stringify(results)).not.toContain(SECRET_TRANSCRIPT);
    });
  });
});

describe("A transcript written through lib/transcripts.ts's bulk-upload path is still private everywhere lib/programs.ts reads", () => {
  it("stays absent from getProgramBySlug, listPrograms, and toPublicProgram after saveTranscriptsBulk writes it", async () => {
    const row = seedProgram({ slug: "prog-bulk", status: "PUBLISHED" });

    await saveTranscriptsBulk([{ slug: "prog-bulk", text: SECRET_TRANSCRIPT }], { confirmOverwrite: false });

    // The write landed on the underlying row (bulk-upload's whole point)...
    expect(row.videoTranscript).toBe(SECRET_TRANSCRIPT);

    // ...but every lib/programs.ts read path still keeps it out.
    const bySlug = await getProgramBySlug("prog-bulk");
    expect(bySlug).not.toHaveProperty("videoTranscript");
    expect(JSON.stringify(bySlug)).not.toContain(SECRET_TRANSCRIPT);

    const listed = await listPrograms({});
    expect(JSON.stringify(listed)).not.toContain(SECRET_TRANSCRIPT);

    const publicRow = toPublicProgram({ ...row });
    expect(publicRow).not.toHaveProperty("videoTranscript");
    expect(JSON.stringify(publicRow)).not.toContain(SECRET_TRANSCRIPT);
  });
});
