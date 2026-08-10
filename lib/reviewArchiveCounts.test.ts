import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Proves the HARD NON-GOAL: archiving or hard-deleting a review must not change poll
 * response counts, per-question n, or a program's unlock/publish state.
 * getProgramPollSummary (lib/pollResults.ts) computes every one of those numbers from
 * `PollResponse`/`PollAnswer` alone -- it never reads `PollReview` at all. That's
 * asserted two ways: (1) the exact same summary is recomputed before and after
 * archiving a review for the same program, with the seeded response/answer data
 * untouched in between, and (2) structurally, `fakePrisma.pollReview.*` is never
 * invoked while computing the summary, which is the reason (1) can never drift even if
 * a future edit tried to make it.
 *
 * `@/lib/pollConfig` and `@/lib/siteContent` are mocked at the module boundary (same
 * precedent as lib/pollReferences.test.ts mocking `@/lib/pollConfig`) rather than
 * simulated via the fake prisma, since their own internals aren't what this test is
 * about.
 */
vi.mock("@/lib/siteContent", () => ({
  getSiteContent: vi.fn(async () => null), // kill switch off
}));

const CORE_QUESTION = {
  id: "q_core_1",
  key: "core_q",
  text: "How was it?",
  type: "STARS",
  labels: ["1", "2", "3", "4", "5"],
  dropdownOptions: null,
  version: 1,
  status: "ACTIVE",
  scaleType: "EVALUATIVE",
  lowPhrase: null,
  highPhrase: "loved it",
  tier: "CONTEXTUAL",
  optionKind: null,
};

vi.mock("@/lib/pollConfig", () => ({
  getProgramPollConfig: vi.fn(async () => ({
    bucketIds: [],
    addedQuestionIds: [],
    removedQuestionIds: [],
    resultsVisible: true,
    minResponsesToPublish: 2,
    grandfatheredQuestionIds: [],
    displayFormat: "STARS",
    placeholderOverride: null,
    editorialBestFor: null,
    pollLinkPublic: false,
  })),
  getQuestionsForProgram: vi.fn(async () => ({ core: [CORE_QUESTION], extras: [] })),
}));

const { fakePrisma, resetDb, seedCountedResponseWithAnswer, seedApprovedPollReview } = vi.hoisted(() => {
  type PollResponseRow = { id: string; programId: string; status: string };
  type PollAnswerRow = { responseId: string; questionId: string; value: number };
  type PollReviewRow = {
    id: string;
    programId: string;
    status: string;
    moderatorNote: string | null;
    responseStatus: string;
  };

  const db = {
    pollResponses: [] as PollResponseRow[],
    pollAnswers: [] as PollAnswerRow[],
    pollReviews: [] as PollReviewRow[],
    seq: 0,
  };

  function nextId(prefix: string) {
    db.seq += 1;
    return `${prefix}_${db.seq}`;
  }

  const fakePrisma = {
    pollResponse: {
      count: vi.fn(async (args: { where: { programId: string; status: string } }) =>
        db.pollResponses.filter((r) => r.programId === args.where.programId && r.status === args.where.status).length
      ),
    },
    questionBucket: {
      findFirst: vi.fn(async () => ({ id: "bucket_core", name: "Core", order: 0 })),
      findMany: vi.fn(async () => []),
    },
    pollAnswer: {
      groupBy: vi.fn(async (args: { where: { response: { programId: string; status: string } } }) => {
        const respIds = new Set(
          db.pollResponses
            .filter((r) => r.programId === args.where.response.programId && r.status === args.where.response.status)
            .map((r) => r.id)
        );
        const byQuestion = new Map<string, number[]>();
        for (const a of db.pollAnswers) {
          if (!respIds.has(a.responseId)) continue;
          const list = byQuestion.get(a.questionId) ?? [];
          list.push(a.value);
          byQuestion.set(a.questionId, list);
        }
        return Array.from(byQuestion.entries()).map(([questionId, values]) => ({
          questionId,
          _avg: { value: values.reduce((s, v) => s + v, 0) / values.length },
          _count: { _all: values.length },
        }));
      }),
    },
    pollQuestion: { findMany: vi.fn(async () => []) },
    // The model under test for the archive/counts-independence proof -- fully
    // implemented so archivePollReview/restorePollReview (lib/pollReviews.ts) work
    // against it, and so calls made against it during a summary computation are
    // provably absent, not merely unmocked.
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
      findMany: vi.fn(async () => []),
      delete: vi.fn(async (args: { where: { id: string } }) => {
        db.pollReviews = db.pollReviews.filter((r) => r.id !== args.where.id);
        return {};
      }),
      create: vi.fn(async () => ({})),
    },
  };

  return {
    fakePrisma,
    resetDb() {
      db.pollResponses = [];
      db.pollAnswers = [];
      db.pollReviews = [];
      db.seq = 0;
      for (const model of Object.values(fakePrisma)) {
        for (const fn of Object.values(model)) {
          (fn as ReturnType<typeof vi.fn>).mockClear();
        }
      }
    },
    seedCountedResponseWithAnswer(programId: string, questionId: string, value: number) {
      const responseId = nextId("resp");
      db.pollResponses.push({ id: responseId, programId, status: "COUNTED" });
      db.pollAnswers.push({ responseId, questionId, value });
      return responseId;
    },
    seedApprovedPollReview(programId: string) {
      const id = nextId("review");
      db.pollReviews.push({ id, programId, status: "APPROVED", moderatorNote: null, responseStatus: "COUNTED" });
      return id;
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const { getProgramPollSummary } = await import("./pollResults");
const { archivePollReview, restorePollReview } = await import("./pollReviews");

beforeEach(() => resetDb());

describe("archiving/restoring a review never changes poll counts (hard non-goal)", () => {
  it("responseCount, per-question count/mean/published are identical before and after archiving a review", async () => {
    seedCountedResponseWithAnswer("prog_1", "q_core_1", 5);
    seedCountedResponseWithAnswer("prog_1", "q_core_1", 3);
    const reviewId = seedApprovedPollReview("prog_1");

    const before = await getProgramPollSummary("prog_1");
    expect(before.responseCount).toBe(2);
    expect(before.questions).toHaveLength(1);
    expect(before.questions[0]).toMatchObject({ key: "core_q", count: 2, mean: 4, published: true });

    const archiveResult = await archivePollReview(reviewId, "mod_1", "spam");
    expect(archiveResult).toEqual({ ok: true, programId: "prog_1" });

    const after = await getProgramPollSummary("prog_1");
    expect(after).toEqual(before);
  });

  it("restoring an archived review also leaves counts untouched", async () => {
    seedCountedResponseWithAnswer("prog_1", "q_core_1", 4);
    seedCountedResponseWithAnswer("prog_1", "q_core_1", 4);
    const reviewId = seedApprovedPollReview("prog_1");
    await archivePollReview(reviewId, "mod_1");

    const beforeRestore = await getProgramPollSummary("prog_1");
    const restoreResult = await restorePollReview(reviewId, "mod_1");
    expect(restoreResult.ok).toBe(true);
    const afterRestore = await getProgramPollSummary("prog_1");

    expect(afterRestore).toEqual(beforeRestore);
  });

  it("structural proof: getProgramPollSummary never touches the PollReview table", async () => {
    seedCountedResponseWithAnswer("prog_1", "q_core_1", 5);
    seedApprovedPollReview("prog_1");
    fakePrisma.pollReview.findMany.mockClear();
    fakePrisma.pollReview.findUnique.mockClear();
    fakePrisma.pollReview.update.mockClear();
    fakePrisma.pollReview.delete.mockClear();

    await getProgramPollSummary("prog_1");

    expect(fakePrisma.pollReview.findMany).not.toHaveBeenCalled();
    expect(fakePrisma.pollReview.findUnique).not.toHaveBeenCalled();
    expect(fakePrisma.pollReview.update).not.toHaveBeenCalled();
    expect(fakePrisma.pollReview.delete).not.toHaveBeenCalled();
  });
});
