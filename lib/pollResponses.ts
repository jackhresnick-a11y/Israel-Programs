import { prisma } from "@/lib/prisma";

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && err.code === "P2002");
}

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
