import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression coverage for the N+1 fix (perf(admin): batch the readiness-bar count) --
 * countResponsesMeetingReadinessBarByProgram batches what countResponsesMeetingReadinessBar
 * used to do once per program. The real regression risk of batching multiple programs'
 * queries together is cross-program leakage (program A's response counted against program
 * B, or vice versa), so this seeds two independent programs and asserts each gets its own
 * correct count. Hand-rolled in-memory Prisma fake via vi.mock("@/lib/prisma"), following
 * lib/pollReferences.test.ts's pattern.
 */
const { fakePrisma, resetDb, seedCoreQuestions, seedProgram, seedResponse, seedAnswer } = vi.hoisted(() => {
  const db = {
    programs: [] as { id: string }[],
    buckets: [] as { id: string; name: string; description: string | null; questionIds: string[]; order: number; isCore: boolean; status: string }[],
    questions: [] as { id: string; key: string; text: string; type: string; labels: string[]; dropdownOptions: unknown; version: number; status: string; scaleType: string; lowPhrase: string | null; highPhrase: string | null; tier: string; optionKind: string | null }[],
    responses: [] as { id: string; programId: string; status: string; naQuestionIds: string[]; presentedQuestionIds: string[] }[],
    answers: [] as { responseId: string; questionId: string }[],
  };

  const fakePrisma = {
    program: {
      findMany: async (args: { where?: { id?: { in?: string[] } } }) => {
        const ids = args.where?.id?.in;
        return db.programs.filter((p) => !ids || ids.includes(p.id)).map((p) => ({ ...p, durationType: "CUSTOM", tags: [] }));
      },
    },
    programPollConfig: {
      findMany: async () => [] as unknown[],
    },
    questionBucket: {
      findMany: async () => db.buckets,
    },
    pollQuestion: {
      findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in;
        return db.questions.filter((q) => !ids || ids.includes(q.id));
      },
    },
    bucketAttachmentRule: {
      findMany: async () => [] as unknown[],
    },
    pollResponse: {
      findMany: async (args: { where?: { programId?: { in?: string[] }; status?: string } }) => {
        const ids = args.where?.programId?.in;
        return db.responses.filter(
          (r) => (!ids || ids.includes(r.programId)) && (!args.where?.status || r.status === args.where.status)
        );
      },
    },
    pollAnswer: {
      groupBy: async (args: { where: { response: { programId: { in: string[] }; status: string } } }) => {
        const countedResponseIds = new Set(
          db.responses
            .filter((r) => args.where.response.programId.in.includes(r.programId) && r.status === args.where.response.status)
            .map((r) => r.id)
        );
        return db.answers.filter((a) => countedResponseIds.has(a.responseId));
      },
    },
  };

  function seedProgram(id: string) {
    db.programs.push({ id });
  }

  function seedCoreQuestions(ids: string[]) {
    db.buckets.push({
      id: "bucket_core",
      name: "Core",
      description: null,
      questionIds: ids,
      order: 0,
      isCore: true,
      status: "ACTIVE",
    });
    for (const id of ids) {
      db.questions.push({
        id,
        key: id,
        text: id,
        type: "STARS",
        labels: [],
        dropdownOptions: null,
        version: 1,
        status: "ACTIVE",
        scaleType: "EVALUATIVE",
        lowPhrase: null,
        highPhrase: null,
        tier: "CONTEXTUAL",
        optionKind: null,
      });
    }
  }

  function seedResponse(id: string, programId: string) {
    db.responses.push({ id, programId, status: "COUNTED", naQuestionIds: [], presentedQuestionIds: [] });
  }

  function seedAnswer(responseId: string, questionId: string) {
    db.answers.push({ responseId, questionId });
  }

  return {
    fakePrisma,
    resetDb: () => {
      db.programs = [];
      db.buckets = [];
      db.questions = [];
      db.responses = [];
      db.answers = [];
    },
    seedCoreQuestions,
    seedProgram,
    seedResponse,
    seedAnswer,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const { countResponsesMeetingReadinessBarByProgram, countResponsesMeetingReadinessBar } = await import(
  "@/lib/pollResults"
);

beforeEach(() => {
  resetDb();
});

describe("countResponsesMeetingReadinessBarByProgram", () => {
  it("computes each program's count independently -- no cross-program leakage", async () => {
    seedCoreQuestions(["q1", "q2", "q3"]);
    seedProgram("progA");
    seedProgram("progB");

    // progA's one response crosses the bar (all 3 Core questions answered).
    seedResponse("respA", "progA");
    seedAnswer("respA", "q1");
    seedAnswer("respA", "q2");
    seedAnswer("respA", "q3");

    // progB's one response does not (only 1 of 3 answered, floor is 3).
    seedResponse("respB", "progB");
    seedAnswer("respB", "q1");

    const counts = await countResponsesMeetingReadinessBarByProgram(["progA", "progB"]);

    expect(counts.get("progA")).toBe(1);
    expect(counts.get("progB")).toBe(0);
  });

  it("returns an empty map for an empty id list without querying", async () => {
    const counts = await countResponsesMeetingReadinessBarByProgram([]);
    expect(counts.size).toBe(0);
  });
});

describe("countResponsesMeetingReadinessBar (single-id wrapper)", () => {
  it("agrees with the batched function for the same program", async () => {
    seedCoreQuestions(["q1", "q2", "q3"]);
    seedProgram("progA");
    seedResponse("respA", "progA");
    seedAnswer("respA", "q1");
    seedAnswer("respA", "q2");
    seedAnswer("respA", "q3");

    const single = await countResponsesMeetingReadinessBar("progA");
    const batched = await countResponsesMeetingReadinessBarByProgram(["progA"]);

    expect(single).toBe(1);
    expect(single).toBe(batched.get("progA"));
  });
});
