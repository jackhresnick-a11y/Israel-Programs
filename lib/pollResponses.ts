import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { POLL_FLAGS, type PollFlag } from "@/lib/pollShared";
import { sendPollVerifyEmail } from "@/lib/email";
import { pollVerifyUrl } from "@/lib/siteUrl";
import type { PollCompletion } from "@/app/generated/prisma/enums";

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && err.code === "P2002");
}

const VERIFY_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The signed-in user's current counted rating for this program, if any -- used to
 * pre-fill RateForm ("Update your rating") for the update-in-place flow (locked
 * decision: a repeat signed-in visitor edits their existing response rather than being
 * rejected or creating a second row). */
export async function getExistingSignedInResponse(programId: string, userId: string) {
  return prisma.pollResponse.findFirst({
    where: { programId, userId, status: "COUNTED" },
    include: { answers: true },
  });
}

type SignedInSubmitInput = {
  programId: string;
  userId: string;
  answers: { questionId: string; value: number }[];
  ipHash: string;
};

async function attemptSignedInSubmit(input: SignedInSubmitInput) {
  const questions = await prisma.pollQuestion.findMany({
    where: { id: { in: input.answers.map((a) => a.questionId) } },
    select: { id: true, version: true },
  });
  const versionById = new Map(questions.map((q) => [q.id, q.version]));

  return prisma.$transaction(async (tx) => {
    const existing = await tx.pollResponse.findFirst({
      where: { programId: input.programId, userId: input.userId, status: "COUNTED" },
    });

    const response = existing
      ? await tx.pollResponse.update({ where: { id: existing.id }, data: { ipHash: input.ipHash } })
      : await tx.pollResponse.create({
          data: {
            programId: input.programId,
            userId: input.userId,
            verified: true,
            status: "COUNTED",
            ipHash: input.ipHash,
          },
        });

    if (existing) {
      await tx.pollAnswer.deleteMany({ where: { responseId: existing.id } });
    }

    await tx.pollAnswer.createMany({
      data: input.answers.map((a) => ({
        responseId: response.id,
        questionId: a.questionId,
        questionVersion: versionById.get(a.questionId) ?? 1,
        value: a.value,
      })),
    });

    return response;
  });
}

/**
 * Signed-in submission: verified + COUNTED immediately, no email step, ever. A repeat
 * visit updates the existing counted response in place (deletes and recreates its
 * answers in the same transaction) rather than creating a second row or rejecting the
 * resubmit -- the partial unique index on (userId, programId, status=COUNTED) is the
 * DB-level backstop against a concurrent double-submit race, which this function
 * retries once against (the retry's findFirst will see the row the losing race created
 * and update it instead of colliding again).
 */
export async function submitSignedInResponse(input: SignedInSubmitInput) {
  try {
    return await attemptSignedInSubmit(input);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return await attemptSignedInSubmit(input);
    }
    throw err;
  }
}

type AnonymousSubmitInput = {
  programId: string;
  referrerTokenId: string | null;
  tokenFlags: PollFlag[];
  answers: { questionId: string; value: number }[];
  yearAttended: number | null;
  completion: PollCompletion | null;
  ipHash: string;
};

/**
 * Anonymous link-path submission: always PENDING, unverified -- only the magic-link
 * click in verifyPollResponse below flips it to COUNTED+verified. Carries forward
 * whatever flags the token validation already found (over cap, revoked, expired -- see
 * lib/pollTokens.ts's validateReferrerToken) and adds `repeat_ip` if this ipHash has
 * already submitted a non-voided response for this same program, so moderation can see
 * the signal without anything being silently dropped.
 */
export async function submitAnonymousResponse(input: AnonymousSubmitInput) {
  const questions = await prisma.pollQuestion.findMany({
    where: { id: { in: input.answers.map((a) => a.questionId) } },
    select: { id: true, version: true },
  });
  const versionById = new Map(questions.map((q) => [q.id, q.version]));

  const priorFromSameIp = await prisma.pollResponse.count({
    where: { programId: input.programId, ipHash: input.ipHash, status: { not: "VOIDED" } },
  });
  const flags = priorFromSameIp > 0 ? [...input.tokenFlags, POLL_FLAGS.REPEAT_IP] : input.tokenFlags;

  const response = await prisma.pollResponse.create({
    data: {
      programId: input.programId,
      referrerTokenId: input.referrerTokenId,
      status: "PENDING",
      verified: false,
      yearAttended: input.yearAttended,
      completion: input.completion,
      ipHash: input.ipHash,
      flags,
    },
  });

  await prisma.pollAnswer.createMany({
    data: input.answers.map((a) => ({
      responseId: response.id,
      questionId: a.questionId,
      questionVersion: versionById.get(a.questionId) ?? 1,
      value: a.value,
    })),
  });

  return response;
}

/**
 * Adds non-core "add more detail" answers to a still-pending response, after the
 * initial submit. Restricted to PENDING responses only -- the responseId is a bare cuid
 * capability (no auth), so this must never be able to mutate a response that's already
 * COUNTED or VOIDED. skipDuplicates makes a retried/double-submitted expander harmless
 * rather than a 500 (the composite PollAnswer PK would otherwise reject it).
 */
export async function addDetailAnswers(responseId: string, answers: { questionId: string; value: number }[]) {
  const response = await prisma.pollResponse.findUnique({ where: { id: responseId }, select: { status: true } });
  if (!response || response.status !== "PENDING") {
    throw new Error("This response can no longer be edited");
  }

  const questions = await prisma.pollQuestion.findMany({
    where: { id: { in: answers.map((a) => a.questionId) } },
    select: { id: true, version: true },
  });
  const versionById = new Map(questions.map((q) => [q.id, q.version]));

  await prisma.pollAnswer.createMany({
    data: answers.map((a) => ({
      responseId,
      questionId: a.questionId,
      questionVersion: versionById.get(a.questionId) ?? 1,
      value: a.value,
    })),
    skipDuplicates: true,
  });
}

export type AttachEmailResult = { ok: true } | { ok: false; reason: string };

/**
 * Attaches an email to a pending response and sends the magic-link verification email.
 * Re-attaching (the alum re-enters their address) regenerates a fresh token rather than
 * reusing a stale one -- same "always mint fresh" posture as Folder.shareToken. A failed
 * send leaves the response PENDING (still admin-visible/moderatable) and reports the
 * failure back to the caller so the thank-you screen can say so, rather than silently
 * pretending the email went out.
 */
export async function attachEmailAndSendVerification(
  responseId: string,
  email: string,
  programName: string
): Promise<AttachEmailResult> {
  const response = await prisma.pollResponse.findUnique({ where: { id: responseId }, select: { status: true } });
  if (!response || response.status !== "PENDING") {
    return { ok: false, reason: "This response can no longer be verified" };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

  await prisma.pollResponse.update({
    where: { id: responseId },
    data: { email: normalizedEmail, verifyToken: token, verifyTokenExpiresAt: expiresAt, verifyEmailSentAt: null },
  });

  const sendResult = await sendPollVerifyEmail({
    to: normalizedEmail,
    programName,
    verifyUrl: pollVerifyUrl(token),
  });
  if (!sendResult.ok) {
    return { ok: false, reason: "We couldn't send that email -- double check the address and try again" };
  }

  await prisma.pollResponse.update({ where: { id: responseId }, data: { verifyEmailSentAt: new Date() } });
  return { ok: true };
}

export type VerifyResult =
  | { ok: true; programSlug: string }
  | { ok: false; reason: "invalid" | "expired" | "already_counted" };

/**
 * The magic-link click. A second verification attempt for an email that's already
 * counted+verified for this program hits the partial unique index and gets voided with
 * a duplicate_email flag rather than double-counting -- "already counted" is a normal,
 * expected outcome here (e.g. the alum clicked an old email a second time), not an
 * error to surface as a 500.
 */
export async function verifyPollResponse(token: string): Promise<VerifyResult> {
  const response = await prisma.pollResponse.findUnique({
    where: { verifyToken: token },
    include: { program: { select: { slug: true } } },
  });
  if (!response) return { ok: false, reason: "invalid" };
  if (response.verifyTokenExpiresAt && response.verifyTokenExpiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }

  try {
    await prisma.pollResponse.update({
      where: { id: response.id },
      data: { verified: true, status: "COUNTED", verifyToken: null },
    });
    return { ok: true, programSlug: response.program.slug };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      await prisma.pollResponse.update({
        where: { id: response.id },
        data: { status: "VOIDED", verifyToken: null, flags: { push: POLL_FLAGS.DUPLICATE_EMAIL } },
      });
      return { ok: false, reason: "already_counted" };
    }
    throw err;
  }
}
