-- CreateEnum
CREATE TYPE "PollQuestionType" AS ENUM ('STARS', 'RADIO', 'DROPDOWN');

-- CreateEnum
CREATE TYPE "PollLifecycleStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "PollResponseStatus" AS ENUM ('PENDING', 'COUNTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PollCompletion" AS ENUM ('FULL', 'PARTIAL', 'DROPPED');

-- CreateEnum
CREATE TYPE "PollDisplayFormat" AS ENUM ('STARS', 'PERCENT', 'BOTH');

-- CreateTable
CREATE TABLE "PollQuestion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "PollQuestionType" NOT NULL,
    "labels" TEXT[],
    "dropdownOptions" JSONB,
    "status" "PollLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PollQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBucket" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "questionIds" TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "status" "PollLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "QuestionBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramPollConfig" (
    "programId" TEXT NOT NULL,
    "bucketIds" TEXT[],
    "addedQuestionIds" TEXT[],
    "removedQuestionIds" TEXT[],
    "resultsVisible" BOOLEAN NOT NULL DEFAULT false,
    "minResponsesToPublish" INTEGER NOT NULL DEFAULT 7,
    "displayFormat" "PollDisplayFormat" NOT NULL DEFAULT 'STARS',
    "placeholderOverride" TEXT,

    CONSTRAINT "ProgramPollConfig_pkey" PRIMARY KEY ("programId")
);

-- CreateTable
CREATE TABLE "PollResponse" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "referrerTokenId" TEXT,
    "yearAttended" INTEGER,
    "completion" "PollCompletion",
    "status" "PollResponseStatus" NOT NULL DEFAULT 'PENDING',
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ipHash" TEXT NOT NULL,
    "verifyToken" TEXT,
    "verifyTokenExpiresAt" TIMESTAMP(3),
    "verifyEmailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollAnswer" (
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionVersion" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "PollAnswer_pkey" PRIMARY KEY ("responseId","questionId")
);

-- CreateTable
CREATE TABLE "ReferrerToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "maxResponses" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferrerToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PollQuestion_key_key" ON "PollQuestion"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PollResponse_verifyToken_key" ON "PollResponse"("verifyToken");

-- CreateIndex
CREATE INDEX "PollResponse_programId_status_verified_idx" ON "PollResponse"("programId", "status", "verified");

-- CreateIndex
CREATE INDEX "PollResponse_programId_ipHash_idx" ON "PollResponse"("programId", "ipHash");

-- CreateIndex
CREATE INDEX "PollResponse_referrerTokenId_idx" ON "PollResponse"("referrerTokenId");

-- CreateIndex
CREATE INDEX "PollAnswer_questionId_idx" ON "PollAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferrerToken_token_key" ON "ReferrerToken"("token");

-- CreateIndex
CREATE INDEX "ReferrerToken_programId_idx" ON "ReferrerToken"("programId");

-- AddForeignKey
ALTER TABLE "ProgramPollConfig" ADD CONSTRAINT "ProgramPollConfig_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_referrerTokenId_fkey" FOREIGN KEY ("referrerTokenId") REFERENCES "ReferrerToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollAnswer" ADD CONSTRAINT "PollAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "PollResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollAnswer" ADD CONSTRAINT "PollAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PollQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferrerToken" ADD CONSTRAINT "ReferrerToken_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added below: Prisma has no first-class syntax for CHECK constraints or partial
-- (WHERE-qualified) unique indexes, so these are written directly and are NOT
-- reproducible by regenerating this migration. Prisma ignores both in drift detection,
-- so they will never show up as "unexpected" -- but `prisma db push` does NOT preserve
-- hand-written SQL and would silently drop them. Never run `prisma db push` against
-- this schema; always use `prisma migrate dev`/`migrate deploy`.

-- Enforce the 1-5 rating scale at the DB level, not just in zod -- belt-and-suspenders
-- against any write path that bypasses application validation.
ALTER TABLE "PollAnswer"
  ADD CONSTRAINT "PollAnswer_value_range" CHECK ("value" BETWEEN 1 AND 5);

-- One counted response per signed-in user per program (the "update in place" flow in
-- lib/pollResponses.ts reuses the existing counted row rather than inserting a second
-- one, but this index is the DB-level backstop against a concurrent double-submit race).
CREATE UNIQUE INDEX "PollResponse_userId_programId_counted_key"
  ON "PollResponse" ("userId", "programId")
  WHERE "status" = 'COUNTED' AND "userId" IS NOT NULL;

-- One counted+verified response per email per program (the link-path magic-link flow).
-- A second verification attempt for an already-counted email hits this and gets voided
-- with a duplicate_email flag instead of double-counting -- see verifyPollResponse.
CREATE UNIQUE INDEX "PollResponse_email_programId_counted_verified_key"
  ON "PollResponse" ("email", "programId")
  WHERE "status" = 'COUNTED' AND "verified" = true AND "email" IS NOT NULL;
