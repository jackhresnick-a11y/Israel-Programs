import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Directly proves the fix requirement 2 asked for: an abandoned INCOMPLETE row from the
 * same ipHash must never count as a "prior" response and wrongly flag a respondent's own
 * later, real completion. A hand-rolled in-memory PollResponse table lets this test
 * assert on the EXACT where-clause behavior (status scoping), not just the end result.
 */
const { fakePrisma, seedResponse, resetDb } = vi.hoisted(() => {
  type Row = { programId: string; ipHash: string; status: string };
  const rows: Row[] = [];
  return {
    fakePrisma: {
      pollResponse: {
        count: vi.fn(async (args: { where: { programId: string; ipHash: string; status: { in: string[] } } }) => {
          const { programId, ipHash, status } = args.where;
          return rows.filter((r) => r.programId === programId && r.ipHash === ipHash && status.in.includes(r.status)).length;
        }),
      },
    },
    seedResponse: (row: Row) => rows.push(row),
    resetDb: () => {
      rows.length = 0;
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const { decideAnonymousStatus } = await import("./pollUnlock");

beforeEach(() => resetDb());

describe("decideAnonymousStatus -- repeat-ip counting excludes INCOMPLETE", () => {
  it("an abandoned INCOMPLETE row from the same ipHash does NOT flag a later real attempt", async () => {
    seedResponse({ programId: "prog_1", ipHash: "hash_a", status: "INCOMPLETE" });
    const { status, flags } = await decideAnonymousStatus({
      programId: "prog_1",
      ipHash: "hash_a",
      tokenFlags: [],
      hasBrowserMarker: false,
    });
    expect(status).toBe("COUNTED");
    expect(flags).toEqual([]);
  });

  it("a genuine prior COUNTED response from the same ipHash DOES flag the next one", async () => {
    seedResponse({ programId: "prog_1", ipHash: "hash_a", status: "COUNTED" });
    const { status, flags } = await decideAnonymousStatus({
      programId: "prog_1",
      ipHash: "hash_a",
      tokenFlags: [],
      hasBrowserMarker: false,
    });
    expect(status).toBe("FLAGGED");
    expect(flags).toContain("repeat_ip");
  });

  it("a prior FLAGGED response from the same ipHash also counts as a repeat", async () => {
    seedResponse({ programId: "prog_1", ipHash: "hash_a", status: "FLAGGED" });
    const { status } = await decideAnonymousStatus({
      programId: "prog_1",
      ipHash: "hash_a",
      tokenFlags: [],
      hasBrowserMarker: false,
    });
    expect(status).toBe("FLAGGED");
  });

  it("a VOIDED prior response never counts as a repeat", async () => {
    seedResponse({ programId: "prog_1", ipHash: "hash_a", status: "VOIDED" });
    const { status } = await decideAnonymousStatus({
      programId: "prog_1",
      ipHash: "hash_a",
      tokenFlags: [],
      hasBrowserMarker: false,
    });
    expect(status).toBe("COUNTED");
  });

  it("multiple abandoned INCOMPLETE rows from the same person still never trip repeat_ip", async () => {
    // Simulates someone opening the poll, abandoning it, returning and abandoning again,
    // then finally completing it for real -- none of the abandoned attempts should
    // count against the final real one.
    seedResponse({ programId: "prog_1", ipHash: "hash_a", status: "INCOMPLETE" });
    seedResponse({ programId: "prog_1", ipHash: "hash_a", status: "INCOMPLETE" });
    seedResponse({ programId: "prog_1", ipHash: "hash_a", status: "INCOMPLETE" });
    const { status } = await decideAnonymousStatus({
      programId: "prog_1",
      ipHash: "hash_a",
      tokenFlags: [],
      hasBrowserMarker: false,
    });
    expect(status).toBe("COUNTED");
  });

  it("token flags and hasBrowserMarker still combine additively with the ip check", async () => {
    seedResponse({ programId: "prog_1", ipHash: "hash_a", status: "COUNTED" });
    const { status, flags } = await decideAnonymousStatus({
      programId: "prog_1",
      ipHash: "hash_a",
      tokenFlags: ["token_over_cap"],
      hasBrowserMarker: true,
    });
    expect(status).toBe("FLAGGED");
    expect(flags).toEqual(expect.arrayContaining(["token_over_cap", "repeat_ip", "repeat_browser"]));
  });
});
