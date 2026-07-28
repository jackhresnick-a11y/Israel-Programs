import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Task A: the anonymous poll's single 18+-gated contact-email field creates a PENDING
 * alumni Reference (lib/references.ts's upsertReferenceFromPoll), wired into
 * lib/pollResponses.ts's submitAnonymousResponse. These tests exercise the gate, DB-level
 * idempotency, the privacy invariants, the cutover, and the "reference write never fails
 * the poll" guarantee against an in-memory Prisma fake (same posture as folders.test.ts).
 */
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
    };
    type PollResponseRow = {
      id: string;
      programId: string;
      status: string;
      email: string | null;
    };

    const db = {
      references: [] as ReferenceRow[],
      pollResponses: [] as PollResponseRow[],
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
            ...(args.create as Partial<ReferenceRow>),
          } as ReferenceRow;
          db.references.push(row);
          return row;
        }),
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
        create: vi.fn(
          async (args: { data: { programId: string; status: string; email?: string | null } }) => {
          const row: PollResponseRow = {
            id: nextId("resp"),
            programId: args.data.programId,
            status: args.data.status,
            email: args.data.email ?? null,
          };
          db.pollResponses.push(row);
          return row;
        }),
      },
      pollAnswer: { createMany: vi.fn(async () => ({ count: 0 })) },
      pollReview: { create: vi.fn(async () => ({})) },
      pollQuestion: { findMany: vi.fn(async () => [] as { id: string; version: number }[]) },
    };

    return {
      fakePrisma,
      resetDb() {
        db.references = [];
        db.pollResponses = [];
        db.seq = 0;
        db.upsertError = null;
        db.lastReferenceFindManyArgs = null;
        for (const model of Object.values(fakePrisma)) {
          for (const fn of Object.values(model)) {
            (fn as ReturnType<typeof vi.fn>).mockClear();
          }
        }
      },
      snapshot: () => ({ references: db.references, pollResponses: db.pollResponses }),
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
  POLL_REFERENCE_DISPLAY_NAME,
} = await import("./references");
const { submitAnonymousResponse } = await import("./pollResponses");
const { POLL_REFERENCE_CONSENT_LABEL, POLL_REFERENCE_CONSENT_VERSION } = await import("./pollShared");

function baseAnonymousInput(overrides: Record<string, unknown> = {}) {
  return {
    programId: "prog_1",
    referrerTokenId: "tok_1",
    tokenFlags: [] as never[],
    answers: [] as { questionId: string; value: number }[],
    naQuestionIds: [] as string[],
    reviews: [] as { questionId: string; text: string }[],
    presentedQuestionIds: [] as string[],
    yearAttended: 2020 as number | null,
    completion: null,
    ipHash: "hash",
    hasBrowserMarker: false,
    referenceEmail: null as string | null,
    ageAttested: false,
    ...overrides,
  };
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

describe("submitAnonymousResponse ↔ reference integration", () => {
  it("valid email + 18+ → poll saved AND 1 reference", async () => {
    const { response } = await submitAnonymousResponse(
      baseAnonymousInput({ referenceEmail: "alum@example.com", ageAttested: true })
    );
    expect(response.id).toBeTruthy();
    expect(snapshot().pollResponses).toHaveLength(1);
    expect(snapshot().references).toHaveLength(1);
  });

  it("no email → poll saved, 0 references (legacy PollResponse.email is never consulted)", async () => {
    await submitAnonymousResponse(baseAnonymousInput({ referenceEmail: null, ageAttested: true }));
    expect(snapshot().pollResponses).toHaveLength(1);
    // the created PollResponse row carries no email at all under the new path
    expect(snapshot().pollResponses[0].email).toBeNull();
    expect(snapshot().references).toHaveLength(0);
    expect(fakePrisma.reference.upsert).not.toHaveBeenCalled();
  });

  it("malformed email → poll saved, 0 references", async () => {
    await submitAnonymousResponse(
      baseAnonymousInput({ referenceEmail: "notanemail", ageAttested: true })
    );
    expect(snapshot().pollResponses).toHaveLength(1);
    expect(snapshot().references).toHaveLength(0);
  });

  it("pre-existing PollResponse email values can never produce a reference", async () => {
    // Simulate the cutover: an old-style row that had an email but no new-path payload.
    // The new code path receives no referenceEmail → creates nothing, and never reads
    // PollResponse.email.
    await submitAnonymousResponse(baseAnonymousInput({ referenceEmail: null, ageAttested: false }));
    expect(snapshot().references).toHaveLength(0);
    expect(fakePrisma.reference.upsert).not.toHaveBeenCalled();
  });

  it("resubmitting the same email through the poll stays exactly 1 reference", async () => {
    await submitAnonymousResponse(
      baseAnonymousInput({ referenceEmail: "alum@example.com", ageAttested: true })
    );
    await submitAnonymousResponse(
      baseAnonymousInput({ referenceEmail: "alum@example.com", ageAttested: true })
    );
    expect(snapshot().pollResponses).toHaveLength(2); // two responses
    expect(snapshot().references).toHaveLength(1); // but one reference
  });

  it("reference write throwing never fails the poll submission", async () => {
    setUpsertError(new Error("db down"));
    const { response } = await submitAnonymousResponse(
      baseAnonymousInput({ referenceEmail: "alum@example.com", ageAttested: true })
    );
    expect(response.id).toBeTruthy(); // poll still returns success
    expect(snapshot().pollResponses).toHaveLength(1);
    expect(snapshot().references).toHaveLength(0);
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
