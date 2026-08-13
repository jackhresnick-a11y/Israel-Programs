import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The end-of-poll elaboration block's server logic (lib/pollElaborations.ts), the direct
 * counterpart of lib/pollReferences.test.ts/lib/reviewArchive.test.ts for PollReview.
 * `@/lib/pollElaborationPrompts` is mocked at the module boundary (same "mock at the
 * module boundary" precedent as lib/pollReferences.test.ts mocking @/lib/pollConfig) to a
 * fixed two-prompt config -- one enabled, one disabled -- rather than exercising its own
 * SiteContent read.
 */
vi.mock("@/lib/pollElaborationPrompts", () => ({
  getElaborationPromptsConfig: vi.fn(async () => ({
    v: 1,
    prompts: [
      { key: "wish_known", text: "What do you wish you'd known before you came?", enabled: true },
      { key: "surprised", text: "What surprised you most?", enabled: true },
      { key: "retired_prompt", text: "An old, disabled prompt", enabled: false },
    ],
  })),
  enabledPrompts: (config: { prompts: { key: string; text: string; enabled: boolean }[] }) =>
    config.prompts.filter((p) => p.enabled),
}));

const { fakePrisma, resetDb, snapshot, seedResponse, seedAnswer } = vi.hoisted(() => {
  type AnswerRow = {
    id: string;
    responseId: string;
    programId: string;
    promptKey: string;
    promptText: string;
    text: string;
    consentGiven: boolean;
    consentAt: Date;
    consentLabel: string;
    status: string;
    moderatorNote: string | null;
    archivedAt: Date | null;
    archivedBy: string | null;
    createdAt: Date;
  };
  type ResponseRow = { id: string; programId: string; status: string };

  const db = {
    answers: [] as AnswerRow[],
    responses: [] as ResponseRow[],
    seq: 0,
  };

  function nextId(prefix: string) {
    db.seq += 1;
    return `${prefix}_${db.seq}`;
  }

  function isUniqueViolation(responseId: string, promptKey: string): boolean {
    return db.answers.some((a) => a.responseId === responseId && a.promptKey === promptKey);
  }

  const fakePrisma = {
    pollResponse: {
      findUnique: vi.fn(async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
        const row = db.responses.find((r) => r.id === args.where.id);
        if (!row) return null;
        if (!args.select) return row;
        return Object.fromEntries(
          Object.keys(args.select)
            .filter((k) => args.select![k])
            .map((k) => [k, (row as Record<string, unknown>)[k]])
        );
      }),
    },
    pollElaborationAnswer: {
      create: vi.fn(async (args: { data: Partial<AnswerRow> & { responseId: string; programId: string; promptKey: string } }) => {
        if (isUniqueViolation(args.data.responseId, args.data.promptKey)) {
          const err = new Error("Unique constraint failed") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        // status defaults to PENDING at the schema level (PollReviewStatus @default), same
        // as the real DB -- the real create() call never passes it explicitly.
        const row: AnswerRow = {
          id: nextId("elab"),
          promptText: "",
          text: "",
          consentGiven: false,
          consentAt: new Date(),
          consentLabel: "",
          status: "PENDING",
          moderatorNote: null,
          archivedAt: null,
          archivedBy: null,
          createdAt: new Date(),
          ...args.data,
        };
        db.answers.push(row);
        return row;
      }),
      findUnique: vi.fn(async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
        const row = db.answers.find((a) => a.id === args.where.id);
        if (!row) return null;
        const response = db.responses.find((r) => r.id === row.responseId);
        return { ...row, programId: row.programId, status: row.status, response: { status: response?.status } };
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<AnswerRow> }) => {
        const row = db.answers.find((a) => a.id === args.where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, args.data);
        return row;
      }),
      findMany: vi.fn(
        async (args: { where: { programId?: string; status?: string; response?: { status?: unknown } } }) => {
          return db.answers
            .filter((a) => {
              if (args.where.programId !== undefined && a.programId !== args.where.programId) return false;
              if (args.where.status !== undefined && a.status !== args.where.status) return false;
              const respFilter = args.where.response?.status;
              if (respFilter !== undefined) {
                const response = db.responses.find((r) => r.id === a.responseId);
                if (respFilter && typeof respFilter === "object" && "notIn" in (respFilter as object)) {
                  const notIn = (respFilter as { notIn: string[] }).notIn;
                  if (!response || notIn.includes(response.status)) return false;
                } else if (!response || response.status !== respFilter) {
                  return false;
                }
              }
              return true;
            })
            .map((a) => ({
              text: a.text,
              promptKey: a.promptKey,
              promptText: a.promptText,
              response: { yearAttended: null },
            }));
        }
      ),
    },
  };

  return {
    fakePrisma,
    resetDb() {
      db.answers = [];
      db.responses = [];
      db.seq = 0;
      for (const model of Object.values(fakePrisma)) {
        for (const fn of Object.values(model)) {
          (fn as ReturnType<typeof vi.fn>).mockClear();
        }
      }
    },
    snapshot: () => ({ answers: db.answers, responses: db.responses }),
    seedResponse(row: Partial<ResponseRow> & { id: string; programId: string }) {
      const full: ResponseRow = { status: "COUNTED", ...row };
      db.responses.push(full);
      return full;
    },
    seedAnswer(row: Partial<AnswerRow> & { responseId: string; programId: string }) {
      const full: AnswerRow = {
        id: nextId("elab"),
        promptKey: "wish_known",
        promptText: "What do you wish you'd known before you came?",
        text: "Answer text",
        consentGiven: true,
        consentAt: new Date(),
        consentLabel: "consent",
        status: "PENDING",
        moderatorNote: null,
        archivedAt: null,
        archivedBy: null,
        createdAt: new Date(),
        ...row,
      };
      db.answers.push(full);
      return full;
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const {
  createElaborationAnswer,
  approveElaborationAnswer,
  rejectElaborationAnswer,
  archiveElaborationAnswer,
  restoreElaborationAnswer,
  listPublicElaborations,
} = await import("./pollElaborations");

beforeEach(() => resetDb());

describe("createElaborationAnswer", () => {
  it("creates a PENDING row for a live, enabled prompt", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "COUNTED" });
    const result = await createElaborationAnswer({ responseId: "resp_1", promptKey: "wish_known", text: "Bring warm clothes." });
    expect(result).toEqual({ ok: true, skipped: false });
    const { answers } = snapshot();
    expect(answers).toHaveLength(1);
    expect(answers[0].status).toBe("PENDING");
    expect(answers[0].consentGiven).toBe(true);
    expect(answers[0].promptText).toBe("What do you wish you'd known before you came?");
  });

  it("rejects an unknown promptKey", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "COUNTED" });
    const result = await createElaborationAnswer({ responseId: "resp_1", promptKey: "not_a_real_prompt", text: "x" });
    expect(result).toEqual({ ok: false, reason: "This prompt is no longer available" });
    expect(snapshot().answers).toHaveLength(0);
  });

  it("rejects a disabled promptKey the same way as an unknown one", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "COUNTED" });
    const result = await createElaborationAnswer({ responseId: "resp_1", promptKey: "retired_prompt", text: "x" });
    expect(result).toEqual({ ok: false, reason: "This prompt is no longer available" });
    expect(snapshot().answers).toHaveLength(0);
  });

  it("refuses a VOIDED response", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "VOIDED" });
    const result = await createElaborationAnswer({ responseId: "resp_1", promptKey: "wish_known", text: "x" });
    expect(result).toEqual({ ok: false, reason: "This response can no longer be edited" });
    expect(snapshot().answers).toHaveLength(0);
  });

  it("a duplicate (responseId, promptKey) is reported skipped, not thrown, and creates no second row", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "COUNTED" });
    await createElaborationAnswer({ responseId: "resp_1", promptKey: "wish_known", text: "first" });
    const second = await createElaborationAnswer({ responseId: "resp_1", promptKey: "wish_known", text: "retry" });
    expect(second).toEqual({ ok: true, skipped: true });
    expect(snapshot().answers).toHaveLength(1);
    expect(snapshot().answers[0].text).toBe("first"); // not overwritten
  });

  it("answering a prompt (or being skipped) mutates no PollResponse field -- readiness/counting is untouched", async () => {
    const response = seedResponse({ id: "resp_1", programId: "prog_1", status: "INCOMPLETE" });
    const before = { ...response };
    await createElaborationAnswer({ responseId: "resp_1", promptKey: "wish_known", text: "x" });
    expect(response).toEqual(before);
    expect(fakePrisma.pollResponse.findUnique).toHaveBeenCalled();
    // Only ever read the response, never wrote to it -- there is no pollResponse.update
    // call anywhere in createElaborationAnswer's implementation.
    expect((fakePrisma.pollResponse as unknown as { update?: unknown }).update).toBeUndefined();
  });

  it("works against an INCOMPLETE response just as well as a COUNTED one", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "INCOMPLETE" });
    const result = await createElaborationAnswer({ responseId: "resp_1", promptKey: "wish_known", text: "x" });
    expect(result).toEqual({ ok: true, skipped: false });
  });
});

describe("approveElaborationAnswer", () => {
  it("refuses a VOIDED parent response", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "VOIDED" });
    const answer = seedAnswer({ responseId: "resp_1", programId: "prog_1" });
    const result = await approveElaborationAnswer(answer.id, "mod_1");
    expect(result).toEqual({ ok: false, reason: "The parent response was voided" });
  });

  it("refuses a FLAGGED parent response", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "FLAGGED" });
    const answer = seedAnswer({ responseId: "resp_1", programId: "prog_1" });
    const result = await approveElaborationAnswer(answer.id, "mod_1");
    expect(result).toEqual({ ok: false, reason: "The parent response is flagged for review" });
  });

  it("allows approval when the parent response is only INCOMPLETE (looser than PollReview's COUNTED-only gate)", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "INCOMPLETE" });
    const answer = seedAnswer({ responseId: "resp_1", programId: "prog_1" });
    const result = await approveElaborationAnswer(answer.id, "mod_1");
    expect(result).toEqual({ ok: true });
    expect(snapshot().answers[0].status).toBe("APPROVED");
  });

  it("allows approval when the parent response is COUNTED", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "COUNTED" });
    const answer = seedAnswer({ responseId: "resp_1", programId: "prog_1" });
    const result = await approveElaborationAnswer(answer.id, "mod_1");
    expect(result).toEqual({ ok: true });
  });
});

describe("reject / archive / restore", () => {
  it("rejected answers are retained (status REJECTED), not deleted", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "COUNTED" });
    const answer = seedAnswer({ responseId: "resp_1", programId: "prog_1" });
    await rejectElaborationAnswer(answer.id, "mod_1", "off-topic");
    expect(snapshot().answers).toHaveLength(1);
    expect(snapshot().answers[0].status).toBe("REJECTED");
    expect(snapshot().answers[0].moderatorNote).toBe("off-topic");
  });

  it("archive → restore round-trips back to APPROVED and clears the archive fields", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "COUNTED" });
    const answer = seedAnswer({ responseId: "resp_1", programId: "prog_1", status: "APPROVED" });

    const archived = await archiveElaborationAnswer(answer.id, "mod_1", "spam");
    expect(archived).toEqual({ ok: true, programId: "prog_1" });
    expect(answer.status).toBe("ARCHIVED");
    expect(answer.archivedBy).toBe("mod_1");

    const restored = await restoreElaborationAnswer(answer.id, "mod_1");
    expect(restored).toEqual({ ok: true, programId: "prog_1" });
    expect(answer.status).toBe("APPROVED");
    expect(answer.archivedAt).toBeNull();
    expect(answer.archivedBy).toBeNull();
  });

  it("restore refuses when the parent response has since been voided", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "COUNTED" });
    const answer = seedAnswer({ responseId: "resp_1", programId: "prog_1", status: "ARCHIVED" });
    await fakePrisma.pollResponse.findUnique({ where: { id: "resp_1" } }); // sanity: row exists
    snapshot().responses[0].status = "VOIDED";
    const result = await restoreElaborationAnswer(answer.id, "mod_1");
    expect(result).toEqual({ ok: false, reason: "The parent response was voided" });
  });
});

describe("listPublicElaborations", () => {
  it("excludes non-APPROVED rows", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "COUNTED" });
    seedAnswer({ responseId: "resp_1", programId: "prog_1", status: "PENDING", text: "pending text" });
    expect(await listPublicElaborations("prog_1")).toHaveLength(0);
  });

  it("excludes an APPROVED row whose parent response is VOIDED", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "VOIDED" });
    seedAnswer({ responseId: "resp_1", programId: "prog_1", status: "APPROVED", text: "voided text" });
    expect(await listPublicElaborations("prog_1")).toHaveLength(0);
  });

  it("excludes an APPROVED row whose parent response is FLAGGED", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "FLAGGED" });
    seedAnswer({ responseId: "resp_1", programId: "prog_1", status: "APPROVED", text: "flagged text" });
    expect(await listPublicElaborations("prog_1")).toHaveLength(0);
  });

  it("includes an APPROVED row whose parent response is COUNTED, grouped by prompt", async () => {
    seedResponse({ id: "resp_1", programId: "prog_1", status: "COUNTED" });
    seedAnswer({ responseId: "resp_1", programId: "prog_1", status: "APPROVED", promptKey: "wish_known", text: "visible text" });
    const groups = await listPublicElaborations("prog_1");
    expect(groups).toHaveLength(1);
    expect(groups[0].promptKey).toBe("wish_known");
    expect(groups[0].answers).toEqual([{ text: "visible text", yearAttended: null }]);
  });
});
