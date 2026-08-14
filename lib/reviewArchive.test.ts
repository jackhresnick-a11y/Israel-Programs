import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Archive/restore for both review models (PollReview, standalone Review). Covers:
 * - archive/restore gates (only reachable from the "live" status; restore of a poll
 *   review re-checks the parent response is still COUNTED)
 * - "archive → hidden, restore → visible again" on every public reader
 * - the positive-allowlist guarantee: every public reader's status filter is a bare
 *   equality against the one "live" value, never a negative (`not`/`notIn`) filter --
 *   which is *why* adding ARCHIVED hides archived rows everywhere with zero read-path
 *   edits (see the schema doc comments on PollReviewStatus/ReviewStatus).
 *
 * `@/lib/pollConfig`'s getQuestionsForProgram is mocked to an empty resolved set --
 * listPublicReviews only uses it for group ordering, which isn't what this file tests
 * (same "mock at the module boundary" precedent as lib/pollReferences.test.ts).
 */
vi.mock("@/lib/pollConfig", () => ({
  getQuestionsForProgram: vi.fn(async () => ({ core: [], extras: [] })),
}));

const { fakePrisma, resetDb, seedPollReview, seedReview, seedProgram, lastArgs } = vi.hoisted(() => {
  type PollReviewRow = {
    id: string;
    programId: string;
    status: string;
    text: string;
    questionId: string;
    responseStatus: string;
    moderatorNote: string | null;
    archivedAt: Date | null;
    archivedBy: string | null;
  };
  type ReviewRow = {
    id: string;
    programId: string;
    status: string;
    text: string;
    rating: number;
    reviewerName: string;
    isAnonymous: boolean;
    createdAt: Date;
    moderatorNote: string | null;
    archivedAt: Date | null;
    archivedBy: string | null;
  };
  type ProgramRow = { id: string; slug: string; status: string; name: string };

  const db = {
    pollReviews: [] as PollReviewRow[],
    reviews: [] as ReviewRow[],
    programs: [] as ProgramRow[],
    seq: 0,
    lastArgs: {} as Record<string, unknown>,
  };

  function nextId(prefix: string) {
    db.seq += 1;
    return `${prefix}_${db.seq}`;
  }

  // Generic status-equality matcher -- returns true only for a bare `{status: "X"}`
  // equality check. Throws on anything else (a `not`/`notIn`/`in` operator), so a
  // future edit that widens a public reader's filter to a negative check fails this
  // test immediately instead of silently starting to leak archived rows.
  function matchesPositiveStatus(row: { status: string }, whereStatus: unknown): boolean {
    if (typeof whereStatus !== "string") {
      throw new Error(`expected a bare string status filter, got ${JSON.stringify(whereStatus)}`);
    }
    return row.status === whereStatus;
  }

  const fakePrisma = {
    pollReview: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        const row = db.pollReviews.find((r) => r.id === args.where.id);
        if (!row) return null;
        return { ...row, response: { status: row.responseStatus } };
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<PollReviewRow> }) => {
        const row = db.pollReviews.find((r) => r.id === args.where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, args.data);
        return row;
      }),
      findMany: vi.fn(
        async (args: {
          where: { programId: string; status: unknown; response?: { status?: unknown } };
        }) => {
          db.lastArgs.pollReviewFindMany = args;
          return db.pollReviews
            .filter(
              (r) =>
                r.programId === args.where.programId &&
                matchesPositiveStatus(r, args.where.status) &&
                (args.where.response?.status === undefined || r.responseStatus === args.where.response.status)
            )
            .map((r) => ({
              text: r.text,
              questionId: r.questionId,
              question: { key: "q", text: "Q" },
              response: { yearAttended: null },
            }));
        }
      ),
      delete: vi.fn(async (args: { where: { id: string } }) => {
        db.pollReviews = db.pollReviews.filter((r) => r.id !== args.where.id);
        return {};
      }),
    },
    review: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        const row = db.reviews.find((r) => r.id === args.where.id);
        return row ? { ...row } : null;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<ReviewRow> }) => {
        const row = db.reviews.find((r) => r.id === args.where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, args.data);
        return row;
      }),
      findMany: vi.fn(
        async (args: { where: { programId?: string; status: unknown; program?: { status: unknown } } }) => {
          db.lastArgs.reviewFindMany = args;
          return db.reviews
            .filter((r) => {
              if (args.where.programId !== undefined && r.programId !== args.where.programId) return false;
              if (!matchesPositiveStatus(r, args.where.status)) return false;
              if (args.where.program?.status !== undefined) {
                const program = db.programs.find((p) => p.id === r.programId);
                if (!program || program.status !== args.where.program.status) return false;
              }
              return true;
            })
            .map((r) => ({
              id: r.id,
              rating: r.rating,
              text: r.text,
              reviewerName: r.reviewerName,
              isAnonymous: r.isAnonymous,
              createdAt: r.createdAt,
              program: { name: "Program", slug: "program" },
            }));
        }
      ),
      delete: vi.fn(async (args: { where: { id: string } }) => {
        db.reviews = db.reviews.filter((r) => r.id !== args.where.id);
        return {};
      }),
    },
    program: {
      findUnique: vi.fn(
        async (args: { where: { slug: string }; include?: { reviews?: { where: { status: unknown } } } }) => {
          db.lastArgs.programFindUnique = args;
          const program = db.programs.find((p) => p.slug === args.where.slug);
          if (!program) return null;
          const reviewWhere = args.include?.reviews?.where;
          const reviews = reviewWhere
            ? db.reviews.filter((r) => r.programId === program.id && matchesPositiveStatus(r, reviewWhere.status))
            : [];
          return { ...program, tags: [], videos: [], reviews };
        }
      ),
      findMany: vi.fn(
        async (args: {
          where: { status: string; slug?: { in: string[] } };
          include?: { reviews?: { where: { status: unknown } } };
        }) => {
          db.lastArgs.programFindMany = args;
          const reviewWhere = args.include?.reviews?.where;
          return db.programs
            .filter((p) => p.status === args.where.status)
            .filter((p) => (args.where.slug ? args.where.slug.in.includes(p.slug) : true))
            .map((p) => ({
              ...p,
              tags: [],
              reviews: reviewWhere
                ? db.reviews.filter((r) => r.programId === p.id && matchesPositiveStatus(r, reviewWhere.status))
                : [],
              // This fake doesn't seed References/PollResponses -- both are always 0,
              // same as real Prisma would return for a program with none.
              _count: { references: 0, pollResponses: 0 },
            }));
        }
      ),
    },
    tag: { findMany: vi.fn(async () => []) },
  };

  return {
    fakePrisma,
    lastArgs: () => db.lastArgs,
    resetDb() {
      db.pollReviews = [];
      db.reviews = [];
      db.programs = [];
      db.seq = 0;
      db.lastArgs = {};
      for (const model of Object.values(fakePrisma)) {
        for (const fn of Object.values(model)) {
          (fn as ReturnType<typeof vi.fn>).mockClear();
        }
      }
    },
    seedPollReview(row: Partial<PollReviewRow> & { programId: string }) {
      const full: PollReviewRow = {
        id: nextId("pollreview"),
        status: "APPROVED",
        text: "Great program",
        questionId: "q_1",
        responseStatus: "COUNTED",
        moderatorNote: null,
        archivedAt: null,
        archivedBy: null,
        ...row,
      };
      db.pollReviews.push(full);
      return full;
    },
    seedReview(row: Partial<ReviewRow> & { programId: string }) {
      const full: ReviewRow = {
        id: nextId("review"),
        status: "PUBLISHED",
        text: "Loved it",
        rating: 5,
        reviewerName: "Alum",
        isAnonymous: false,
        createdAt: new Date(),
        moderatorNote: null,
        archivedAt: null,
        archivedBy: null,
        ...row,
      };
      db.reviews.push(full);
      return full;
    },
    seedProgram(row: Partial<ProgramRow> & { id: string }) {
      const full: ProgramRow = { slug: row.id, status: "PUBLISHED", name: "Program", ...row };
      db.programs.push(full);
      return full;
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const { archivePollReview, restorePollReview, hardDeletePollReview } = await import("./pollReviews");
const {
  archiveStandaloneReview,
  restoreStandaloneReview,
  hardDeleteStandaloneReview,
  listPublicStandaloneReviews,
  listRecentReviews,
} = await import("./reviews");
const { listPublicReviews } = await import("./pollResults");
const { getProgramBySlug, listPrograms, getProgramsBySlugs } = await import("./programs");

beforeEach(() => resetDb());

describe("PollReview archive/restore gates", () => {
  it("archive refuses a non-APPROVED review", async () => {
    const review = seedPollReview({ programId: "prog_1", status: "PENDING" });
    const result = await archivePollReview(review.id, "mod_1");
    expect(result).toEqual({ ok: false, reason: "Only an approved review can be archived" });
  });

  it("restore refuses a non-ARCHIVED review", async () => {
    const review = seedPollReview({ programId: "prog_1", status: "APPROVED" });
    const result = await restorePollReview(review.id, "mod_1");
    expect(result).toEqual({ ok: false, reason: "Only an archived review can be restored" });
  });

  it("restore refuses when the parent response is no longer COUNTED", async () => {
    const review = seedPollReview({ programId: "prog_1", status: "ARCHIVED", responseStatus: "VOIDED" });
    const result = await restorePollReview(review.id, "mod_1");
    expect(result).toEqual({ ok: false, reason: "The parent response isn’t counted anymore" });
  });

  it("archive → restore round-trips back to APPROVED, clears moderatorNote/archivedAt/archivedBy", async () => {
    const review = seedPollReview({ programId: "prog_1", status: "APPROVED" });
    const archived = await archivePollReview(review.id, "mod_1", "spam");
    expect(archived).toEqual({ ok: true, programId: "prog_1" });
    expect(review.status).toBe("ARCHIVED");
    expect(review.moderatorNote).toBe("spam");
    expect(review.archivedBy).toBe("mod_1");
    expect(review.archivedAt).toBeInstanceOf(Date);

    const restored = await restorePollReview(review.id, "mod_1");
    expect(restored).toEqual({ ok: true, programId: "prog_1" });
    expect(review.status).toBe("APPROVED");
    expect(review.moderatorNote).toBeNull();
    expect(review.archivedAt).toBeNull();
    expect(review.archivedBy).toBeNull();
  });

  it("hardDeletePollReview returns null for a missing id and does not call delete", async () => {
    const result = await hardDeletePollReview("nope");
    expect(result).toBeNull();
    expect(fakePrisma.pollReview.delete).not.toHaveBeenCalled();
  });

  it("hardDeletePollReview removes the row and returns its programId", async () => {
    const review = seedPollReview({ programId: "prog_1" });
    const result = await hardDeletePollReview(review.id);
    expect(result).toEqual({ programId: "prog_1" });
    expect(await fakePrisma.pollReview.findUnique({ where: { id: review.id } })).toBeNull();
  });
});

describe("standalone Review archive/restore gates", () => {
  it("archive refuses a non-PUBLISHED review", async () => {
    const review = seedReview({ programId: "prog_1", status: "PENDING" });
    const result = await archiveStandaloneReview(review.id, "mod_1");
    expect(result).toEqual({ ok: false, reason: "Only a published review can be archived" });
  });

  it("restore refuses a non-ARCHIVED review", async () => {
    const review = seedReview({ programId: "prog_1", status: "PUBLISHED" });
    const result = await restoreStandaloneReview(review.id, "mod_1");
    expect(result).toEqual({ ok: false, reason: "Only an archived review can be restored" });
  });

  it("archive → restore round-trips back to PUBLISHED, clears moderatorNote/archivedAt/archivedBy", async () => {
    const review = seedReview({ programId: "prog_1", status: "PUBLISHED" });
    const archived = await archiveStandaloneReview(review.id, "mod_1", "spam");
    expect(archived).toEqual({ ok: true, programId: "prog_1" });
    expect(review.status).toBe("ARCHIVED");
    expect(review.archivedBy).toBe("mod_1");
    expect(review.archivedAt).toBeInstanceOf(Date);

    const restored = await restoreStandaloneReview(review.id, "mod_1");
    expect(restored).toEqual({ ok: true, programId: "prog_1" });
    expect(review.status).toBe("PUBLISHED");
    expect(review.moderatorNote).toBeNull();
    expect(review.archivedAt).toBeNull();
    expect(review.archivedBy).toBeNull();
  });

  it("hardDeleteStandaloneReview returns null for a missing id", async () => {
    const result = await hardDeleteStandaloneReview("nope");
    expect(result).toBeNull();
    expect(fakePrisma.review.delete).not.toHaveBeenCalled();
  });
});

describe("archive → hidden, restore → visible again (public readers)", () => {
  it("listPublicReviews (poll reviews)", async () => {
    const review = seedPollReview({ programId: "prog_1", text: "Amazing" });
    expect(await listPublicReviews("prog_1")).toHaveLength(1);

    review.status = "ARCHIVED";
    expect(await listPublicReviews("prog_1")).toHaveLength(0);

    review.status = "APPROVED";
    expect(await listPublicReviews("prog_1")).toHaveLength(1);
  });

  it("listPublicStandaloneReviews", async () => {
    const review = seedReview({ programId: "prog_1" });
    expect(await listPublicStandaloneReviews("prog_1")).toHaveLength(1);

    review.status = "ARCHIVED";
    expect(await listPublicStandaloneReviews("prog_1")).toHaveLength(0);

    review.status = "PUBLISHED";
    expect(await listPublicStandaloneReviews("prog_1")).toHaveLength(1);
  });

  it("listRecentReviews", async () => {
    seedProgram({ id: "prog_1", status: "PUBLISHED" });
    const review = seedReview({ programId: "prog_1" });
    expect(await listRecentReviews(3)).toHaveLength(1);

    review.status = "ARCHIVED";
    expect(await listRecentReviews(3)).toHaveLength(0);
  });

  it("getProgramBySlug's reviews include", async () => {
    seedProgram({ id: "prog_1", slug: "prog-1", status: "PUBLISHED" });
    const review = seedReview({ programId: "prog_1" });
    const before = await getProgramBySlug("prog-1");
    expect(before?.reviews).toHaveLength(1);

    review.status = "ARCHIVED";
    const after = await getProgramBySlug("prog-1");
    expect(after?.reviews).toHaveLength(0);
  });

  it("listPrograms's reviews include", async () => {
    seedProgram({ id: "prog_1", slug: "prog-1", status: "PUBLISHED" });
    const review = seedReview({ programId: "prog_1" });
    const before = await listPrograms({});
    expect((before[0] as unknown as { reviews: unknown[] }).reviews).toHaveLength(1);

    review.status = "ARCHIVED";
    const after = await listPrograms({});
    expect((after[0] as unknown as { reviews: unknown[] }).reviews).toHaveLength(0);
  });

  it("getProgramsBySlugs's reviews include", async () => {
    seedProgram({ id: "prog_1", slug: "prog-1", status: "PUBLISHED" });
    const review = seedReview({ programId: "prog_1" });
    const before = await getProgramsBySlugs(["prog-1"]);
    expect((before[0] as unknown as { reviews: unknown[] }).reviews).toHaveLength(1);

    review.status = "ARCHIVED";
    const after = await getProgramsBySlugs(["prog-1"]);
    expect((after[0] as unknown as { reviews: unknown[] }).reviews).toHaveLength(0);
  });
});

describe("positive-allowlist guarantee (structural)", () => {
  it("listPublicReviews filters on a bare status equality, not a negative check", async () => {
    seedPollReview({ programId: "prog_1" });
    await listPublicReviews("prog_1");
    const args = lastArgs().pollReviewFindMany as { where: { status: unknown } };
    expect(args.where.status).toBe("APPROVED");
  });

  it("listPublicStandaloneReviews filters on a bare status equality", async () => {
    seedReview({ programId: "prog_1" });
    await listPublicStandaloneReviews("prog_1");
    const args = lastArgs().reviewFindMany as { where: { status: unknown } };
    expect(args.where.status).toBe("PUBLISHED");
  });

  it("listRecentReviews filters on a bare status equality (both program and review)", async () => {
    seedProgram({ id: "prog_1", status: "PUBLISHED" });
    seedReview({ programId: "prog_1" });
    await listRecentReviews(3);
    const args = lastArgs().reviewFindMany as { where: { status: unknown; program: { status: unknown } } };
    expect(args.where.status).toBe("PUBLISHED");
    expect(args.where.program.status).toBe("PUBLISHED");
  });

  it("getProgramBySlug's reviews include filters on a bare status equality", async () => {
    seedProgram({ id: "prog_1", slug: "prog-1", status: "PUBLISHED" });
    await getProgramBySlug("prog-1");
    const args = lastArgs().programFindUnique as { include: { reviews: { where: { status: unknown } } } };
    expect(args.include.reviews.where.status).toBe("PUBLISHED");
  });

  it("listPrograms's reviews include filters on a bare status equality", async () => {
    seedProgram({ id: "prog_1", slug: "prog-1", status: "PUBLISHED" });
    await listPrograms({});
    const args = lastArgs().programFindMany as { include: { reviews: { where: { status: unknown } } } };
    expect(args.include.reviews.where.status).toBe("PUBLISHED");
  });

  it("getProgramsBySlugs's reviews include filters on a bare status equality", async () => {
    seedProgram({ id: "prog_1", slug: "prog-1", status: "PUBLISHED" });
    await getProgramsBySlugs(["prog-1"]);
    const args = lastArgs().programFindMany as { include: { reviews: { where: { status: unknown } } } };
    expect(args.include.reviews.where.status).toBe("PUBLISHED");
  });
});
