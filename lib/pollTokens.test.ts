import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Proves the same requirement-2 fix on the token-cap side: an abandoned INCOMPLETE
 * response must never consume a ReferrerToken's slot, or a token could look "over cap"
 * purely from people who opened the poll and never finished.
 */
const { fakePrisma, seedToken, seedResponse, resetDb } = vi.hoisted(() => {
  type TokenRow = { id: string; revoked: boolean; expiresAt: Date | null; maxResponses: number | null };
  type ResponseRow = { referrerTokenId: string; status: string };
  const tokens: TokenRow[] = [];
  const responses: ResponseRow[] = [];
  return {
    fakePrisma: {
      referrerToken: {
        findUnique: vi.fn(async (args: { where: { id: string } }) => tokens.find((t) => t.id === args.where.id) ?? null),
      },
      pollResponse: {
        count: vi.fn(async (args: { where: { referrerTokenId: string; status: { in: string[] } } }) => {
          const { referrerTokenId, status } = args.where;
          return responses.filter((r) => r.referrerTokenId === referrerTokenId && status.in.includes(r.status)).length;
        }),
      },
    },
    seedToken: (row: TokenRow) => tokens.push(row),
    seedResponse: (row: ResponseRow) => responses.push(row),
    resetDb: () => {
      tokens.length = 0;
      responses.length = 0;
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const { getTokenFlagsById } = await import("./pollTokens");

beforeEach(() => resetDb());

describe("getTokenFlagsById -- cap counting excludes INCOMPLETE", () => {
  it("abandoned INCOMPLETE responses never consume a token's cap", async () => {
    seedToken({ id: "tok_1", revoked: false, expiresAt: null, maxResponses: 2 });
    seedResponse({ referrerTokenId: "tok_1", status: "INCOMPLETE" });
    seedResponse({ referrerTokenId: "tok_1", status: "INCOMPLETE" });
    seedResponse({ referrerTokenId: "tok_1", status: "INCOMPLETE" });
    const flags = await getTokenFlagsById("tok_1");
    expect(flags).not.toContain("token_over_cap");
  });

  it("COUNTED/FLAGGED responses do consume the cap", async () => {
    seedToken({ id: "tok_1", revoked: false, expiresAt: null, maxResponses: 2 });
    seedResponse({ referrerTokenId: "tok_1", status: "COUNTED" });
    seedResponse({ referrerTokenId: "tok_1", status: "FLAGGED" });
    const flags = await getTokenFlagsById("tok_1");
    expect(flags).toContain("token_over_cap");
  });

  it("a mix of INCOMPLETE and COUNTED only counts the COUNTED ones toward the cap", async () => {
    seedToken({ id: "tok_1", revoked: false, expiresAt: null, maxResponses: 2 });
    seedResponse({ referrerTokenId: "tok_1", status: "COUNTED" });
    seedResponse({ referrerTokenId: "tok_1", status: "INCOMPLETE" });
    seedResponse({ referrerTokenId: "tok_1", status: "INCOMPLETE" });
    seedResponse({ referrerTokenId: "tok_1", status: "INCOMPLETE" });
    const flags = await getTokenFlagsById("tok_1");
    expect(flags).not.toContain("token_over_cap"); // only 1 real response, cap is 2
  });

  it("revoked/expired still flag regardless of response counting", async () => {
    seedToken({ id: "tok_revoked", revoked: true, expiresAt: null, maxResponses: null });
    expect(await getTokenFlagsById("tok_revoked")).toContain("token_revoked");

    seedToken({ id: "tok_expired", revoked: false, expiresAt: new Date("2000-01-01"), maxResponses: null });
    expect(await getTokenFlagsById("tok_expired")).toContain("token_expired");
  });

  it("a token with no maxResponses can never be over cap", async () => {
    seedToken({ id: "tok_unlimited", revoked: false, expiresAt: null, maxResponses: null });
    seedResponse({ referrerTokenId: "tok_unlimited", status: "COUNTED" });
    seedResponse({ referrerTokenId: "tok_unlimited", status: "COUNTED" });
    const flags = await getTokenFlagsById("tok_unlimited");
    expect(flags).toEqual([]);
  });
});
