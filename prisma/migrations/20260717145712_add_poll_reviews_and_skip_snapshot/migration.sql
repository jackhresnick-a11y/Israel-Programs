-- CreateEnum
CREATE TYPE "PollReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PollResponse" ADD COLUMN     "presentedQuestionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "PollReview" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionVersion" INTEGER NOT NULL,
    "programId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "status" "PollReviewStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "moderatorNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PollReview_programId_status_idx" ON "PollReview"("programId", "status");

-- CreateIndex
CREATE INDEX "PollReview_status_idx" ON "PollReview"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PollReview_responseId_questionId_key" ON "PollReview"("responseId", "questionId");

-- AddForeignKey
ALTER TABLE "PollReview" ADD CONSTRAINT "PollReview_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "PollResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollReview" ADD CONSTRAINT "PollReview_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PollQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollReview" ADD CONSTRAINT "PollReview_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added below: Prisma has no first-class CHECK syntax, so this is written
-- directly and is NOT reproducible by regenerating this migration. Prisma ignores it
-- in drift detection -- but `prisma db push` does NOT preserve hand-written SQL and
-- would silently drop it, same trap as the PollAnswer value-range CHECK from the
-- original alumni-polls migration. Never run `prisma db push` against this schema.

-- A review row without consent must be impossible, not just unlikely.
ALTER TABLE "PollReview"
  ADD CONSTRAINT "PollReview_consent_required" CHECK ("consentGiven");
