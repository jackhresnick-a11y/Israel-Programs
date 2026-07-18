-- CreateEnum
CREATE TYPE "ProgramFaqStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REJECTED');

-- AlterTable
ALTER TABLE "ProgramPollConfig" ADD COLUMN     "pollLinkPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicTokenId" TEXT;

-- CreateTable
CREATE TABLE "ProgramFAQ" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" "ProgramFaqStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "consentGiven" BOOLEAN,
    "consentAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "moderatorNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramFAQ_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramFAQ_programId_status_idx" ON "ProgramFAQ"("programId", "status");

-- CreateIndex
CREATE INDEX "ProgramFAQ_status_idx" ON "ProgramFAQ"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramPollConfig_publicTokenId_key" ON "ProgramPollConfig"("publicTokenId");

-- AddForeignKey
ALTER TABLE "ProgramPollConfig" ADD CONSTRAINT "ProgramPollConfig_publicTokenId_fkey" FOREIGN KEY ("publicTokenId") REFERENCES "ReferrerToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramFAQ" ADD CONSTRAINT "ProgramFAQ_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added below: Prisma has no first-class syntax for CHECK constraints, so this is
-- written directly and is NOT reproducible by regenerating this migration. Prisma
-- ignores it in drift detection, but `prisma db push` does NOT preserve hand-written
-- SQL and would silently drop it -- same trap as the CHECK constraints in the two
-- alumni-polls migrations before this one. Never run `prisma db push` against this
-- schema; always use `prisma migrate dev`/`migrate deploy`.

-- A visitor-submitted question without consent must be impossible; admin-authored rows
-- have no consent concept at all, so the check only applies when source = 'visitor'.
-- `IS TRUE` (not a bare boolean reference) is deliberate: Postgres CHECK constraints
-- only fail on an expression that evaluates to FALSE, not NULL/UNKNOWN -- a bare
-- `OR "consentGiven"` would let a visitor row with consentGiven IS NULL through
-- silently, since `false OR NULL` is NULL, which CHECK treats as passing.
-- `NULL IS TRUE` correctly evaluates to FALSE, so a NULL consentGiven fails as intended.
ALTER TABLE "ProgramFAQ"
  ADD CONSTRAINT "ProgramFAQ_visitor_consent_required"
  CHECK ("source" IS DISTINCT FROM 'visitor' OR "consentGiven" IS TRUE);
