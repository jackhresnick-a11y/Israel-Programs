import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { POLL_FLAGS, type PollFlag } from "@/lib/pollShared";

export const mintTokenInputSchema = z.object({
  programId: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).nullable().optional(),
  maxResponses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const updateTokenInputSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).nullable().optional(),
  maxResponses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  revoked: z.boolean().optional(),
});

function generateReferrerToken(): string {
  // 192 bits, URL-safe -- same generation as lib/folders.ts's generateShareToken.
  return randomBytes(24).toString("base64url");
}

export async function mintReferrerToken(input: z.infer<typeof mintTokenInputSchema>) {
  return prisma.referrerToken.create({
    data: {
      programId: input.programId,
      token: generateReferrerToken(),
      label: input.label,
      note: input.note ?? null,
      maxResponses: input.maxResponses ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

export async function updateReferrerToken(id: string, patch: z.infer<typeof updateTokenInputSchema>) {
  return prisma.referrerToken.update({ where: { id }, data: patch });
}

export type ReferrerTokenRow = {
  id: string;
  token: string;
  programId: string;
  programName: string;
  programSlug: string;
  label: string;
  note: string | null;
  maxResponses: number | null;
  expiresAt: Date | null;
  revoked: boolean;
  createdAt: Date;
  countedCount: number;
  flaggedCount: number;
};

/** Every referrer token (optionally scoped to one program), each with its counted vs.
 * flagged response split -- feeds the /admin/polls/links table. Voided **and INCOMPLETE**
 * responses count toward neither bucket -- an INCOMPLETE row is an abandoned draft, not
 * something needing an admin look, and folding it into flaggedCount would make normal
 * poll abandonment look like an abuse spike. Legacy PENDING rows (pre-dating the removal
 * of email verification) still fold into `flaggedCount` -- both are "not yet counted,
 * needs an admin look" states, unlike INCOMPLETE. */
export async function listReferrerTokens(programId?: string): Promise<ReferrerTokenRow[]> {
  const tokens = await prisma.referrerToken.findMany({
    where: programId ? { programId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { program: { select: { name: true, slug: true } } },
  });
  if (tokens.length === 0) return [];

  const counts = await prisma.pollResponse.groupBy({
    by: ["referrerTokenId", "status"],
    where: { referrerTokenId: { in: tokens.map((t) => t.id) }, status: { notIn: ["VOIDED", "INCOMPLETE"] } },
    _count: { _all: true },
  });

  const countsByToken = new Map<string, { counted: number; flagged: number }>();
  for (const row of counts) {
    if (!row.referrerTokenId) continue;
    const entry = countsByToken.get(row.referrerTokenId) ?? { counted: 0, flagged: 0 };
    if (row.status === "COUNTED") entry.counted += row._count._all;
    else entry.flagged += row._count._all;
    countsByToken.set(row.referrerTokenId, entry);
  }

  return tokens.map((t) => {
    const counts = countsByToken.get(t.id) ?? { counted: 0, flagged: 0 };
    return {
      id: t.id,
      token: t.token,
      programId: t.programId,
      programName: t.program.name,
      programSlug: t.program.slug,
      label: t.label,
      note: t.note,
      maxResponses: t.maxResponses,
      expiresAt: t.expiresAt,
      revoked: t.revoked,
      createdAt: t.createdAt,
      countedCount: counts.counted,
      flaggedCount: counts.flagged,
    };
  });
}

export type TokenValidation =
  | { ok: true; token: { id: string; programId: string }; flags: PollFlag[] }
  | { ok: false; reason: "missing" };

type TokenCapRow = { id: string; revoked: boolean; expiresAt: Date | null; maxResponses: number | null };

/** Shared by validateReferrerToken (by raw token string, at poll-open time) and
 * getTokenFlagsById (by DB id, re-evaluated fresh at the moment a response crosses the
 * majority bar -- a token could be revoked or go over cap in the time between a
 * respondent opening the poll and actually finishing it, so this is deliberately
 * recomputed then, not carried over from open time). The cap check only counts
 * COUNTED/FLAGGED responses -- never INCOMPLETE -- so an abandoned draft can never
 * silently consume a token's slot. */
async function computeTokenFlags(row: TokenCapRow): Promise<PollFlag[]> {
  const flags: PollFlag[] = [];
  if (row.revoked) flags.push(POLL_FLAGS.TOKEN_REVOKED);
  if (row.expiresAt && row.expiresAt < new Date()) flags.push(POLL_FLAGS.TOKEN_EXPIRED);
  if (row.maxResponses !== null) {
    const usedCount = await prisma.pollResponse.count({
      where: { referrerTokenId: row.id, status: { in: ["COUNTED", "FLAGGED"] } },
    });
    if (usedCount >= row.maxResponses) flags.push(POLL_FLAGS.TOKEN_OVER_CAP);
  }
  return flags;
}

/**
 * Revoked and expired tokens are still accepted, not rejected -- they just carry a flag
 * for moderation to review later, same "never silently drop, always flag" posture as an
 * over-cap token. Only a token that doesn't exist at all returns ok: false, which is
 * what sends a signed-out /rate visitor to the sign-in CTA instead of the anonymous form.
 */
export async function validateReferrerToken(token: string): Promise<TokenValidation> {
  const row = await prisma.referrerToken.findUnique({ where: { token } });
  if (!row) return { ok: false, reason: "missing" };
  const flags = await computeTokenFlags(row);
  return { ok: true, token: { id: row.id, programId: row.programId }, flags };
}

/** Same flag computation as validateReferrerToken, but by the token's DB id -- used at
 * the moment a response crosses the majority bar, when only the id (stored on
 * PollResponse.referrerTokenId at poll-open) is available, not the raw token string. */
export async function getTokenFlagsById(referrerTokenId: string): Promise<PollFlag[]> {
  const row = await prisma.referrerToken.findUnique({ where: { id: referrerTokenId } });
  if (!row) return [];
  return computeTokenFlags(row);
}
