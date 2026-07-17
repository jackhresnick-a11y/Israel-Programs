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
  verifiedCount: number;
  pendingCount: number;
};

/** Every referrer token (optionally scoped to one program), each with its verified vs.
 * pending response split -- feeds the /admin/polls/links table. Voided responses count
 * toward neither bucket (they're neither a live pending submission nor part of the
 * public math). */
export async function listReferrerTokens(programId?: string): Promise<ReferrerTokenRow[]> {
  const tokens = await prisma.referrerToken.findMany({
    where: programId ? { programId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { program: { select: { name: true, slug: true } } },
  });
  if (tokens.length === 0) return [];

  const counts = await prisma.pollResponse.groupBy({
    by: ["referrerTokenId", "verified"],
    where: { referrerTokenId: { in: tokens.map((t) => t.id) }, status: { not: "VOIDED" } },
    _count: { _all: true },
  });

  const countsByToken = new Map<string, { verified: number; pending: number }>();
  for (const row of counts) {
    if (!row.referrerTokenId) continue;
    const entry = countsByToken.get(row.referrerTokenId) ?? { verified: 0, pending: 0 };
    if (row.verified) entry.verified += row._count._all;
    else entry.pending += row._count._all;
    countsByToken.set(row.referrerTokenId, entry);
  }

  return tokens.map((t) => {
    const counts = countsByToken.get(t.id) ?? { verified: 0, pending: 0 };
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
      verifiedCount: counts.verified,
      pendingCount: counts.pending,
    };
  });
}

export type TokenValidation =
  | { ok: true; token: { id: string; programId: string }; flags: PollFlag[] }
  | { ok: false; reason: "missing" };

/**
 * Revoked and expired tokens are still accepted, not rejected -- they just carry a flag
 * for moderation to review later, same "never silently drop, always flag" posture as an
 * over-cap token. Only a token that doesn't exist at all returns ok: false, which is
 * what sends a signed-out /rate visitor to the sign-in CTA instead of the anonymous form.
 */
export async function validateReferrerToken(token: string): Promise<TokenValidation> {
  const row = await prisma.referrerToken.findUnique({ where: { token } });
  if (!row) return { ok: false, reason: "missing" };

  const flags: PollFlag[] = [];
  if (row.revoked) flags.push(POLL_FLAGS.TOKEN_REVOKED);
  if (row.expiresAt && row.expiresAt < new Date()) flags.push(POLL_FLAGS.TOKEN_EXPIRED);
  if (row.maxResponses !== null) {
    const usedCount = await prisma.pollResponse.count({
      where: { referrerTokenId: row.id, status: { not: "VOIDED" } },
    });
    if (usedCount >= row.maxResponses) flags.push(POLL_FLAGS.TOKEN_OVER_CAP);
  }

  return { ok: true, token: { id: row.id, programId: row.programId }, flags };
}
