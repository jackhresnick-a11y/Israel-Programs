-- CreateTable
CREATE TABLE "PollElaborationAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "promptKey" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentLabel" TEXT NOT NULL,
    "status" "PollReviewStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "moderatorNote" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollElaborationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PollElaborationAnswer_programId_status_idx" ON "PollElaborationAnswer"("programId", "status");

-- CreateIndex
CREATE INDEX "PollElaborationAnswer_status_idx" ON "PollElaborationAnswer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PollElaborationAnswer_responseId_promptKey_key" ON "PollElaborationAnswer"("responseId", "promptKey");

-- AddForeignKey
ALTER TABLE "PollElaborationAnswer" ADD CONSTRAINT "PollElaborationAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "PollResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollElaborationAnswer" ADD CONSTRAINT "PollElaborationAnswer_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added below: Prisma has no first-class CHECK syntax, so this is written
-- directly and is NOT reproducible by regenerating this migration. Prisma ignores it
-- in drift detection -- but `prisma db push` does NOT preserve hand-written SQL and
-- would silently drop it, same trap as PollReview's consent CHECK. Never run
-- `prisma db push` against this schema.

-- An elaboration answer row without consent must be impossible, not just unlikely --
-- same posture as PollReview_consent_required.
ALTER TABLE "PollElaborationAnswer"
  ADD CONSTRAINT "PollElaborationAnswer_consent_required" CHECK ("consentGiven");
