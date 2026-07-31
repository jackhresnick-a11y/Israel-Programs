import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Task A: the anonymous poll's single 18+-gated contact-email field creates a PENDING
 * alumni Reference (lib/references.ts's upsertReferenceFromPoll), wired into
 * lib/pollResponses.ts's maybeTransition -- the moment an autosaved response crosses the
 * readiness "unlock" bar (see lib/pollUnlock.ts's hasReachedBucketSpread), not at a
 * one-shot submit anymore. These tests exercise the gate, DB-level idempotency, the
 * privacy invariants, the cutover, and the "reference write never fails the poll"
 * guarantee against an in-memory Prisma fake (same posture as folders.test.ts).
 * `@/lib/pollConfig` is mocked at the module boundary (rather than simulating its own
 * several Prisma calls) to resolve 3 fake Core questions in a single group -- the
 * readiness bar's floor of 3 total answered-or-N/A means a single served group needs
 * all 3 answered, so `openAndCrossReadinessBar` answers all three before asserting on
 * the transition, exercising the real autosave/transition code path.
 */
vi.mock("@/lib/pollConfig", () => ({
  getQuestionsForProgram: vi.fn(async () => ({
    core: [{ id: "q_core_1" }, { id: "q_core_2" }, { id: "q_core_3" }],
    extras: [],
  })),
}));
const { fakePrisma, resetDb, snapshot, seedReference, setUpsertError, getFindManyArgs } =
  vi.hoisted(() => {
    type ReferenceRow = {
      id: string;
      programId: string;
      userId: string;
      displayName: string;
      contactEmail: string;
      attendedText: string;
      status: string;
      consentGiven: boolean;
      consentAt: Date | null;
      consentLabel: string | null;
      consentVersion: string | null;
      pollResponseId: string | null;
      pollEmailKey: string | null;
      createdAt: Date;
    };
    type PollResponseRow = {
      id: string;
      programId: string;
      status: string;
      email: string | null;
      userId: string | null;
      referrerTokenId: string | null;
      ipHash: string;
      flags: string[];
      naQuestionIds: string[];
      presentedQuestionIds: string[];
      referenceEmail: string | null;
      ageAttested: boolean;
      yearAttended: number | null;
    };
    type PollAnswerRow = { responseId: string; questionId: string; value: number };

    const db = {
      references: [] as ReferenceRow[],
      pollResponses: [] as PollResponseRow[],
      pollAnswers: [] as PollAnswerRow[],
      seq: 0,
      upsertError: null as Error | null,
      lastReferenceFindManyArgs: null as unknown,
    };

    function nextId(prefix: string) {
      db.seq += 1;
      return `${prefix}_${db.seq}`;
    }

    const fakePrisma = {
      reference: {
        upsert: vi.fn(
          async (args: {
            where: { programId_pollEmailKey: { programId: string; pollEmailKey: string } };
            create: Record<string, unknown>;
            update?: Record<string, unknown>;
          }) => {
          if (db.upsertError) throw db.upsertError;
          const { programId, pollEmailKey } = args.where.programId_pollEmailKey;
          const existing = db.references.find(
            (r) => r.programId === programId && r.pollEmailKey === pollEmailKey
          );
          if (existing) {
            Object.assign(existing, args.update ?? {});
            return existing;
          }
          const row = {
            id: nextId("ref"),
            consentAt: null,
            consentLabel: null,
            consentVersion: null,
            pollResponseId: null,
            pollEmailKey: null,
            createdAt: new Date(),
            ...(args.create as Partial<ReferenceRow>),
          } as ReferenceRow;
          db.references.push(row);
          return row;
        }),
        count: vi.fn(
          async (args: { where?: { status?: string; createdAt?: { gte?: Date } } }) => {
            const where = args?.where ?? {};
            return db.references.filter(
              (r) =>
                (where.status === undefined || r.status === where.status) &&
                (where.createdAt?.gte === undefined || r.createdAt >= where.createdAt.gte)
            ).length;
          }
        ),
        findMany: vi.fn(
          async (args: { where?: { programId?: string; status?: string }; select?: Record<string, boolean> }) => {
          db.lastReferenceFindManyArgs = args;
          const rows = db.references.filter(
            (r) =>
              (args?.where?.programId === undefined || r.programId === args.where.programId) &&
              (args?.where?.status === undefined || r.status === args.where.status)
          );
          const select = args?.select;
          if (!select) return rows;
          return rows.map((r) =>
            Object.fromEntries(
              Object.keys(select)
                .filter((k) => select[k])
                .map((k) => [k, (r as Record<string, unknown>)[k]])
            )
          );
        }),
      },
      pollResponse: {
        count: vi.fn(async () => 0),
        create: vi.fn(async (args: { data: Partial<PollResponseRow> & { programId: string; status: string } }) => {
          const row: PollResponseRow = {
            id: nextId("resp"),
            programId: args.data.programId,
            status: args.data.status,
            email: args.data.email ?? null,
            userId: args.data.userId ?? null,
            referrerTokenId: args.data.referrerTokenId ?? null,
            ipHash: args.data.ipHash ?? "hash",
            flags: args.data.flags ?? [],
            naQuestionIds: args.data.naQuestionIds ?? [],
            presentedQuestionIds: args.data.presentedQuestionIds ?? [],
            referenceEmail: args.data.referenceEmail ?? null,
            ageAttested: args.data.ageAttested ?? false,
            yearAttended: args.data.yearAttended ?? null,
          };
          db.pollResponses.push(row);
          return row;
        }),
        findUnique: vi.fn(async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
          const row = db.pollResponses.find((r) => r.id === args.where.id);
          if (!row) return null;
          if (!args.select) return row;
          return Object.fromEntries(Object.keys(args.select).filter((k) => args.select![k]).map((k) => [k, (row as Record<string, unknown>)[k]]));
        }),
        findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
          return db.pollResponses.find((r) =>
            Object.entries(args.where).every(([k, v]) => {
              if (k === "status" && v && typeof v === "object" && "in" in (v as object)) {
                return (v as { in: string[] }).in.includes(r.status);
              }
              return (r as Record<string, unknown>)[k] === v;
            })
          ) ?? null;
        }),
        update: vi.fn(async (args: { where: { id: string }; data: Partial<PollResponseRow> }) => {
          const row = db.pollResponses.find((r) => r.id === args.where.id);
          if (!row) throw new Error("not found");
          Object.assign(row, args.data);
          return row;
        }),
        updateMany: vi.fn(async (args: { where: { id: string; status?: string }; data: Partial<PollResponseRow> }) => {
          const row = db.pollResponses.find(
            (r) => r.id === args.where.id && (args.where.status === undefined || r.status === args.where.status)
          );
          if (!row) return { count: 0 };
          Object.assign(row, args.data);
          return { count: 1 };
        }),
      },
      pollAnswer: {
        createMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async (args: { where: { responseId_questionId: { responseId: string; questionId: string } }; create: PollAnswerRow; update: { value: number } }) => {
          const { responseId, questionId } = args.where.responseId_questionId;
          const existing = db.pollAnswers.find((a) => a.responseId === responseId && a.questionId === questionId);
          if (existing) {
            Object.assign(existing, args.update);
            return existing;
          }
          const row = { ...args.create };
          db.pollAnswers.push(row);
          return row;
        }),
        deleteMany: vi.fn(async (args: { where: { responseId: string; questionId?: string } }) => {
          const before = db.pollAnswers.length;
          db.pollAnswers = db.pollAnswers.filter(
            (a) => !(a.responseId === args.where.responseId && (args.where.questionId === undefined || a.questionId === args.where.questionId))
          );
          return { count: before - db.pollAnswers.length };
        }),
        findMany: vi.fn(async (args: { where: { responseId: string } }) => {
          return db.pollAnswers.filter((a) => a.responseId === args.where.responseId).map((a) => ({ questionId: a.questionId }));
        }),
      },
      pollReview: { create: vi.fn(async () => ({})) },
      pollQuestion: { findMany: vi.fn(async () => [] as { id: string; version: number }[]), findUnique: vi.fn(async () => ({ version: 1 })) },
      referrerToken: {
        findUnique: vi.fn(async () => ({ id: "tok_1", revoked: false, expiresAt: null, maxResponses: null })),
      },
    };

    return {
      fakePrisma,
      resetDb() {
        db.references = [];
        db.pollResponses = [];
        db.pollAnswers = [];
        db.seq = 0;
        db.upsertError = null;
        db.lastReferenceFindManyArgs = null;
        for (const model of Object.values(fakePrisma)) {
          for (const fn of Object.values(model)) {
            (fn as ReturnType<typeof vi.fn>).mockClear();
          }
        }
      },
      snapshot: () => ({ references: db.references, pollResponses: db.pollResponses, pollAnswers: db.pollAnswers }),
      seedReference(row: Partial<ReferenceRow> & { programId: string; pollEmailKey: string }) {
        const full: ReferenceRow = {
          id: nextId("ref"),
          userId: `poll:${nextId("resp")}`,
          displayName: "Past participant",
          contactEmail: row.contactEmail ?? row.pollEmailKey,
          attendedText: "2020",
          status: "PENDING",
          consentGiven: true,
          consentAt: new Date(),
          consentLabel: "label",
          consentVersion: "v1",
          pollResponseId: "resp_seed",
          createdAt: new Date(),
          ...row,
        };
        db.references.push(full);
        return full;
      },
      setUpsertError(err: Error | null) {
        db.upsertError = err;
      },
      getFindManyArgs: () => db.lastReferenceFindManyArgs,
    };
  });

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const {
  upsertReferenceFromPoll,
  isValidReferenceEmail,
  listPublishedReferences,
  countRecentPendingReferences,
  POLL_REFERENCE_DISPLAY_NAME,
} = await import("./references");
const { openAnonymousResponse, saveAnswer, addDetailAnswersAndReviews } = await import("./pollResponses");
const { POLL_REFERENCE_CONSENT_LABEL, POLL_REFERENCE_CONSENT_VERSION } = await import("./pollShared");

/** Opens a fresh anonymous response, then autosaves all 3 (mocked) Core questions --
 * the readiness bar's floor of 3 means this is exactly the minimum needed to cross,
 * mirroring the old one-shot submit test shape as closely as possible while exercising
 * the real autosave path. Reference-related fields (referenceEmail/ageAttested) are
 * autosaved first via addDetailAnswersAndReviews (the details/contact-field autosave
 * path), same order the real form saves them in -- whenever they're typed, always
 * before the rating that actually crosses the bar. Only the final saveAnswer call's
 * result is returned, since that's the one where the transition actually fires. */
async function openAndCrossReadinessBar(overrides: {
  referenceEmail?: string | null;
  ageAttested?: boolean;
  hasBrowserMarker?: boolean;
} = {}) {
  const response = await openAnonymousResponse({
    programId: "prog_1",
    referrerTokenId: "tok_1",
    ipHash: "hash",
    presentedQuestionIds: ["q_core_1", "q_core_2", "q_core_3"],
  });
  if (overrides.referenceEmail !== undefined || overrides.ageAttested !== undefined) {
    await addDetailAnswersAndReviews(
      response.id,
      [],
      [],
      [],
      [],
      { referenceEmail: overrides.referenceEmail ?? undefined, ageAttested: overrides.ageAttested ?? undefined }
    );
  }
  await saveAnswer({
    responseId: response.id,
    questionId: "q_core_1",
    questionVersion: 1,
    value: 5,
    na: false,
    hasBrowserMarker: overrides.hasBrowserMarker ?? false,
  });
  await saveAnswer({
    responseId: response.id,
    questionId: "q_core_2",
    questionVersion: 1,
    value: 5,
    na: false,
    hasBrowserMarker: overrides.hasBrowserMarker ?? false,
  });
  const result = await saveAnswer({
    responseId: response.id,
    questionId: "q_core_3",
    questionVersion: 1,
    value: 5,
    na: false,
    hasBrowserMarker: overrides.hasBrowserMarker ?? false,
  });
  return { responseId: response.id, status: result.status };
}

beforeEach(() => resetDb());

describe("upsertReferenceFromPoll (the gate)", () => {
  it("18+ true + valid email → exactly 1 PENDING reference", async () => {
    await upsertReferenceFromPoll({
      programId: "prog_1",
      pollResponseId: "resp_9",
      email: "Alum@Example.com",
      ageAttested: true,
      yearAttended: 2019,
    });
    const { references } = snapshot();
    expect(references).toHaveLength(1);
    const r = references[0];
    expect(r.status).toBe("PENDING");
    expect(r.displayName).toBe(POLL_REFERENCE_DISPLAY_NAME);
    expect(r.displayName).toBe("Past participant");
    expect(r.contactEmail).toBe("Alum@Example.com");
    expect(r.pollEmailKey).toBe("alum@example.com"); // normalized
    expect(r.userId).toBe("poll:resp_9"); // opaque, no email in userId
    expect(r.pollResponseId).toBe("resp_9");
    expect(r.attendedText).toBe("2019");
    expect(r.consentGiven).toBe(true);
    expect(r.consentLabel).toBe(POLL_REFERENCE_CONSENT_LABEL);
    expect(r.consentVersion).toBe(POLL_REFERENCE_CONSENT_VERSION);
  });

  it("18+ false + valid email → 0 references", async () => {
    await upsertReferenceFromPoll({
      programId: "prog_1",
      pollResponseId: "resp_9",
      email: "alum@example.com",
      ageAttested: false,
      yearAttended: 2019,
    });
    expect(snapshot().references).toHaveLength(0);
  });

  it("malformed email → 0 references", async () => {
    for (const bad of ["notanemail", "a@b", "@example.com", "alum@", ""]) {
      await upsertReferenceFromPoll({
        programId: "prog_1",
        pollResponseId: "resp_9",
        email: bad,
        ageAttested: true,
        yearAttended: 2019,
      });
    }
    expect(snapshot().references).toHaveLength(0);
  });

  it("no yearAttended → attendedText 'Not specified'", async () => {
    await upsertReferenceFromPoll({
      programId: "prog_1",
      pollResponseId: "resp_9",
      email: "alum@example.com",
      ageAttested: true,
      yearAttended: null,
    });
    expect(snapshot().references[0].attendedText).toBe("Not specified");
  });

  it("resubmit with the same email (case-insensitive) stays exactly 1", async () => {
    await upsertReferenceFromPoll({
      programId: "prog_1",
      pollResponseId: "resp_1",
      email: "alum@example.com",
      ageAttested: true,
      yearAttended: 2019,
    });
    await upsertReferenceFromPoll({
      programId: "prog_1",
      pollResponseId: "resp_2",
      email: "ALUM@example.com",
      ageAttested: true,
      yearAttended: 2019,
    });
    expect(snapshot().references).toHaveLength(1);
    // update branch is a no-op: the original consent record is untouched
    expect(snapshot().references[0].pollResponseId).toBe("resp_1");
  });

  it("isValidReferenceEmail matches the intended gate", () => {
    expect(isValidReferenceEmail("alum@example.com")).toBe(true);
    expect(isValidReferenceEmail("  alum@example.com  ")).toBe(true);
    expect(isValidReferenceEmail("nope")).toBe(false);
    expect(isValidReferenceEmail("")).toBe(false);
    expect(isValidReferenceEmail(`${"a".repeat(320)}@x.com`)).toBe(false); // >320
  });
});

describe("autosave/readiness-transition ↔ reference integration", () => {
  it("valid email + 18+ → poll transitions COUNTED AND 1 reference", async () => {
    const { responseId, status } = await openAndCrossReadinessBar({
      referenceEmail: "alum@example.com",
      ageAttested: true,
    });
    expect(responseId).toBeTruthy();
    expect(status).toBe("COUNTED");
    expect(snapshot().pollResponses).toHaveLength(1);
    expect(snapshot().references).toHaveLength(1);
  });

  it("no email → poll transitions COUNTED, 0 references (legacy PollResponse.email is never consulted)", async () => {
    await openAndCrossReadinessBar({ ageAttested: true });
    expect(snapshot().pollResponses).toHaveLength(1);
    // the created PollResponse row carries no legacy email at all under the new path
    expect(snapshot().pollResponses[0].email).toBeNull();
    expect(snapshot().references).toHaveLength(0);
    expect(fakePrisma.reference.upsert).not.toHaveBeenCalled();
  });

  it("malformed email → poll transitions COUNTED, 0 references", async () => {
    await openAndCrossReadinessBar({ referenceEmail: "notanemail", ageAttested: true });
    expect(snapshot().pollResponses).toHaveLength(1);
    expect(snapshot().references).toHaveLength(0);
  });

  it("email autosaved without 18+ attested → 0 references", async () => {
    await openAndCrossReadinessBar({ referenceEmail: "alum@example.com", ageAttested: false });
    expect(snapshot().references).toHaveLength(0);
    expect(fakePrisma.reference.upsert).not.toHaveBeenCalled();
  });

  it("resubmitting the same email through two separate responses stays exactly 1 reference", async () => {
    await openAndCrossReadinessBar({ referenceEmail: "alum@example.com", ageAttested: true });
    await openAndCrossReadinessBar({ referenceEmail: "alum@example.com", ageAttested: true });
    expect(snapshot().pollResponses).toHaveLength(2); // two responses
    expect(snapshot().references).toHaveLength(1); // but one reference
  });

  it("reference write throwing never fails the transition", async () => {
    setUpsertError(new Error("db down"));
    const { responseId, status } = await openAndCrossReadinessBar({
      referenceEmail: "alum@example.com",
      ageAttested: true,
    });
    expect(responseId).toBeTruthy();
    expect(status).toBe("COUNTED"); // transition still succeeds
    expect(snapshot().pollResponses).toHaveLength(1);
    expect(snapshot().references).toHaveLength(0);
  });

  it("FLAGGED transition (repeat browser) + valid email + 18+ → 0 references", async () => {
    // hasBrowserMarker trips REPEAT_BROWSER -> status FLAGGED. A valid email + 18+ still
    // creates NO reference; only a COUNTED transition does.
    const { status } = await openAndCrossReadinessBar({
      referenceEmail: "alum@example.com",
      ageAttested: true,
      hasBrowserMarker: true,
    });
    expect(status).toBe("FLAGGED");
    expect(snapshot().pollResponses).toHaveLength(1); // poll response still saved
    expect(snapshot().references).toHaveLength(0); // but no reference
    expect(fakePrisma.reference.upsert).not.toHaveBeenCalled();
  });

  it("an abandoned INCOMPLETE response (never crossing the readiness bar) never triggers a reference", async () => {
    // Open only -- no saveAnswer at all, so it never crosses the readiness bar and
    // stays INCOMPLETE forever, exactly like a real abandoned poll.
    await openAnonymousResponse({
      programId: "prog_1",
      referrerTokenId: "tok_1",
      ipHash: "hash",
      presentedQuestionIds: ["q_core_1"],
    });
    expect(snapshot().pollResponses).toHaveLength(1);
    expect(snapshot().pollResponses[0].status).toBe("INCOMPLETE");
    expect(snapshot().references).toHaveLength(0);
    expect(fakePrisma.reference.upsert).not.toHaveBeenCalled();
  });
});

describe("countRecentPendingReferences (admin health signal)", () => {
  it("counts only PENDING references created within the window", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    seedReference({ programId: "p", pollEmailKey: "a@x.com", status: "PENDING", createdAt: new Date(now - 1 * day) });
    seedReference({ programId: "p", pollEmailKey: "b@x.com", status: "PENDING", createdAt: new Date(now - 6 * day) });
    seedReference({ programId: "p", pollEmailKey: "c@x.com", status: "PENDING", createdAt: new Date(now - 10 * day) }); // outside 7d
    seedReference({ programId: "p", pollEmailKey: "d@x.com", status: "PUBLISHED", createdAt: new Date(now - 1 * day) }); // not pending
    expect(await countRecentPendingReferences(7)).toBe(2);
  });

  it("returns 0 when nothing recent (the 'it broke' signal)", async () => {
    expect(await countRecentPendingReferences(7)).toBe(0);
  });
});

describe("privacy: no contact email / real name in the public payload", () => {
  it("listPublishedReferences selects only public fields (no contactEmail/pollEmailKey/userId)", async () => {
    seedReference({
      programId: "prog_1",
      pollEmailKey: "alum@example.com",
      contactEmail: "alum@example.com",
      status: "PUBLISHED",
    });
    const rows = await listPublishedReferences("prog_1");
    // the select passed to Prisma must not request sensitive columns
    const select = (getFindManyArgs() as { select: Record<string, boolean> }).select;
    expect(select).toEqual({ id: true, displayName: true, attendedText: true, note: true });
    expect(select).not.toHaveProperty("contactEmail");
    expect(select).not.toHaveProperty("pollEmailKey");
    expect(select).not.toHaveProperty("userId");
    // and the returned rows carry neither the email nor a real name
    for (const r of rows as Record<string, unknown>[]) {
      expect(r).not.toHaveProperty("contactEmail");
      expect(r).not.toHaveProperty("pollEmailKey");
      expect(r.displayName).toBe("Past participant");
    }
  });
});
