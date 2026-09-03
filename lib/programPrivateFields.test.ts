import { describe, it, expect, vi, beforeEach } from "vitest";

// --- In-memory Prisma fake, honoring `omit` -----------------------------------
// Unlike app/api/programs/[id]/route.test.ts's fake (which never needs to model
// `omit`), this one implements it for real -- videoTranscript/transcriptTags must
// actually be dropped by the query, not just absent from what the fake happens to
// return, or these tests would pass for the wrong reason.
const {
  fakePrisma,
  resetDb,
  seedProgram,
  getTranscripts,
  getLastFindUniqueArgs,
  getLastFindManyArgs,
  getProvenanceFindManyCallCount,
} = vi.hoisted(() => {
  const db = { programs: [] as Record<string, unknown>[], transcripts: [] as Record<string, unknown>[], seq: 0 };
  let lastFindUniqueArgs: unknown = null;
  let lastFindManyArgs: unknown = null;
  let provenanceFindManyCallCount = 0;

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
    // No relation field connects Program to this table (see ProgramTagProvenance's
    // schema doc comment) -- a public read path calling this would be a deliberate,
    // out-of-band query, not something a blanket `include`/`select: { tags: true }`
    // could ever pick up by accident. This spy proves none of the public read paths
    // do that anyway.
    programTagProvenance: {
      findMany: async () => {
        provenanceFindManyCallCount += 1;
        return [];
      },
    },
    // Transcript is a wholly separate table now (see lib/transcripts.ts) -- none of
    // lib/programs.ts's Program queries select or include it, so this fake exists only
    // to let saveTranscriptsBulk's write succeed; the leak assertion below checks that
    // its written text never shows up in any Program read, not that this table itself
    // is omitted (there's nothing to omit -- it's simply never joined in).
    transcript: {
      create: async (args: { data: { programId: string; filename: string; text: string; sourceUrl: string | null } }) => {
        const row = { id: `tr_${db.transcripts.length + 1}`, ...args.data };
        db.transcripts.push(row);
        return row;
      },
    },
    programBrief: {
      updateMany: async () => ({ count: 0 }),
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
      db.transcripts = [];
      db.seq = 0;
      provenanceFindManyCallCount = 0;
    },
    seedProgram,
    getTranscripts: () => db.transcripts,
    getLastFindUniqueArgs: () => lastFindUniqueArgs,
    getLastFindManyArgs: () => lastFindManyArgs,
    getProvenanceFindManyCallCount: () => provenanceFindManyCallCount,
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

    await saveTranscriptsBulk([{ slug: "prog-bulk", filename: "prog-bulk.txt", text: SECRET_TRANSCRIPT }]);

    // The write landed as a Transcript row (bulk-upload's whole point) -- a wholly
    // separate table from Program, not the legacy Program.videoTranscript column.
    expect(getTranscripts()).toHaveLength(1);
    expect(getTranscripts()[0].text).toBe(SECRET_TRANSCRIPT);

    // ...and every lib/programs.ts read path -- which never selects or joins
    // Transcript at all -- keeps it out.
    const bySlug = await getProgramBySlug("prog-bulk");
    expect(JSON.stringify(bySlug)).not.toContain(SECRET_TRANSCRIPT);

    const listed = await listPrograms({});
    expect(JSON.stringify(listed)).not.toContain(SECRET_TRANSCRIPT);

    const publicRow = toPublicProgram({ ...row });
    expect(JSON.stringify(publicRow)).not.toContain(SECRET_TRANSCRIPT);
  });
});

describe("videoCredit/videoCreditUrl are public -- distinct from videoTranscript/transcriptTags", () => {
  it("getProgramBySlug returns the credit fields while still omitting the transcript fields", async () => {
    seedProgram({
      slug: "prog-credit-a",
      videoCredit: "@handle",
      videoCreditUrl: "https://instagram.com/handle",
      videoTranscript: SECRET_TRANSCRIPT,
      transcriptTags: ["staged-slug"],
    });

    const result = await getProgramBySlug("prog-credit-a");

    expect(result?.videoCredit).toBe("@handle");
    expect(result?.videoCreditUrl).toBe("https://instagram.com/handle");
    expect(result).not.toHaveProperty("videoTranscript");
    expect(result).not.toHaveProperty("transcriptTags");
    expect(JSON.stringify(result)).not.toContain(SECRET_TRANSCRIPT);
  });

  it("listPrograms returns the credit fields while still omitting the transcript fields", async () => {
    seedProgram({
      slug: "prog-credit-b",
      videoCredit: "@handle",
      videoCreditUrl: "https://instagram.com/handle",
      videoTranscript: SECRET_TRANSCRIPT,
      transcriptTags: ["staged-slug"],
    });

    const results = await listPrograms({});

    expect(results).toHaveLength(1);
    expect(results[0].videoCredit).toBe("@handle");
    expect(results[0].videoCreditUrl).toBe("https://instagram.com/handle");
    expect(results[0]).not.toHaveProperty("videoTranscript");
    expect(JSON.stringify(results)).not.toContain(SECRET_TRANSCRIPT);
  });

  it("getProgramsBySlugs returns the credit fields while still omitting the transcript fields", async () => {
    seedProgram({
      slug: "prog-credit-c",
      status: "PUBLISHED",
      videoCredit: "@handle",
      videoCreditUrl: "https://instagram.com/handle",
      videoTranscript: SECRET_TRANSCRIPT,
      transcriptTags: ["staged-slug"],
    });

    const results = await getProgramsBySlugs(["prog-credit-c"]);

    expect(results).toHaveLength(1);
    expect(results[0].videoCredit).toBe("@handle");
    expect(results[0].videoCreditUrl).toBe("https://instagram.com/handle");
    expect(results[0]).not.toHaveProperty("videoTranscript");
    expect(JSON.stringify(results)).not.toContain(SECRET_TRANSCRIPT);
  });

  it("toPublicProgram keeps the credit fields (public, like videoUrl/aiBrief) while still stripping videoTranscript/transcriptTags", () => {
    const row = {
      id: "prog_x",
      name: "X",
      videoUrl: "https://example.com/video",
      videoCredit: "@handle",
      videoCreditUrl: "https://instagram.com/handle",
      videoTranscript: SECRET_TRANSCRIPT,
      transcriptTags: ["staged-slug"],
    };

    const result = toPublicProgram(row);

    expect(result.videoCredit).toBe("@handle");
    expect(result.videoCreditUrl).toBe("https://instagram.com/handle");
    expect(result).not.toHaveProperty("videoTranscript");
    expect(result).not.toHaveProperty("transcriptTags");
    expect(JSON.stringify(result)).not.toContain(SECRET_TRANSCRIPT);
  });
});

describe("Per-tag provenance (ProgramTagProvenance) never reaches the public program DTO", () => {
  it("toPublicProgram strips a `provenance` array even if one arrived on the row (e.g. reused from lib/pollResults.ts's admin-only ProgramBestForRow shape)", () => {
    const row = {
      id: "prog_x",
      name: "X",
      provenance: [
        { tagId: "tag_1", source: "ADMIN_ASSERTED", sourceUrl: "https://internal.example/x", note: "internal note", verifiedBy: "admin_user_id" },
      ],
    };

    const result = toPublicProgram(row);

    expect(result).not.toHaveProperty("provenance");
    expect(JSON.stringify(result)).not.toContain("internal note");
    expect(JSON.stringify(result)).not.toContain("admin_user_id");
  });

  it("getProgramBySlug/listPrograms/getProgramsBySlugs never query prisma.programTagProvenance", async () => {
    seedProgram({ slug: "prog-provenance", status: "PUBLISHED" });

    await getProgramBySlug("prog-provenance");
    await listPrograms({});
    await getProgramsBySlugs(["prog-provenance"]);

    // ProgramTagProvenance has no relation field back to Program (see the model's schema
    // doc comment) -- these three public read paths have no way to reach it structurally,
    // and this spy proves none of them do so via a separate, hand-added query either.
    expect(getProvenanceFindManyCallCount()).toBe(0);
  });
});
