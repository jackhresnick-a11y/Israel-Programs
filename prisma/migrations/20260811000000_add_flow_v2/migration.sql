-- CreateEnum
CREATE TYPE "FlowQuestionType" AS ENUM ('FILTER', 'CHALLENGE', 'TRADEOFF');

-- CreateEnum
CREATE TYPE "FlowMatchMode" AS ENUM ('WEIGHT', 'REQUIRE');

-- CreateEnum
CREATE TYPE "FlowVideoTriggerMode" AS ENUM ('ON_DISPLAY', 'ON_ANSWER');

-- CreateTable
CREATE TABLE "FlowQuestion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "type" "FlowQuestionType" NOT NULL DEFAULT 'CHALLENGE',
    "prompt" TEXT NOT NULL,
    "helpText" TEXT,
    "skippable" BOOLEAN NOT NULL DEFAULT true,
    "showWhen" JSONB,
    "optionSetRules" JSONB,
    "defaultOptionSetKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PollLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rationale" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "optionSetKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tagSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "durationValues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchMode" "FlowMatchMode" NOT NULL DEFAULT 'WEIGHT',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "requireIncludesUntagged" BOOLEAN NOT NULL DEFAULT true,
    "status" "PollLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowVideo" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "embedUrl" TEXT NOT NULL,
    "watchUrl" TEXT NOT NULL,
    "posterUrl" TEXT,
    "transcript" TEXT,
    "notes" TEXT,
    "speaker" TEXT,
    "durationSeconds" INTEGER,
    "status" "PollLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowVideoTrigger" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "mode" "FlowVideoTriggerMode" NOT NULL DEFAULT 'ON_ANSWER',
    "optionKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "when" JSONB,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 100,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "PollLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowVideoTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowSession" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "videoKeysShown" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submittedAt" TIMESTAMP(3),
    "resultHref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowResponse" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "questionVersion" INTEGER NOT NULL,
    "optionKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revision" INTEGER NOT NULL DEFAULT 0,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "videoKeysShown" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlowQuestion_key_key" ON "FlowQuestion"("key");

-- CreateIndex
CREATE INDEX "FlowQuestion_status_order_idx" ON "FlowQuestion"("status", "order");

-- CreateIndex
CREATE INDEX "FlowOption_questionId_status_order_idx" ON "FlowOption"("questionId", "status", "order");

-- CreateIndex
CREATE UNIQUE INDEX "FlowOption_questionId_key_key" ON "FlowOption"("questionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FlowVideo_key_key" ON "FlowVideo"("key");

-- CreateIndex
CREATE INDEX "FlowVideoTrigger_questionId_status_order_idx" ON "FlowVideoTrigger"("questionId", "status", "order");

-- CreateIndex
CREATE INDEX "FlowVideoTrigger_videoId_idx" ON "FlowVideoTrigger"("videoId");

-- CreateIndex
CREATE INDEX "FlowSession_createdAt_idx" ON "FlowSession"("createdAt");

-- CreateIndex
CREATE INDEX "FlowSession_submittedAt_idx" ON "FlowSession"("submittedAt");

-- CreateIndex
CREATE INDEX "FlowResponse_questionKey_createdAt_idx" ON "FlowResponse"("questionKey", "createdAt");

-- CreateIndex
CREATE INDEX "FlowResponse_sessionId_createdAt_idx" ON "FlowResponse"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FlowResponse_sessionId_questionKey_revision_key" ON "FlowResponse"("sessionId", "questionKey", "revision");

-- AddForeignKey
ALTER TABLE "FlowOption" ADD CONSTRAINT "FlowOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "FlowQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowVideoTrigger" ADD CONSTRAINT "FlowVideoTrigger_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "FlowVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowVideoTrigger" ADD CONSTRAINT "FlowVideoTrigger_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "FlowQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowResponse" ADD CONSTRAINT "FlowResponse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FlowSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added below: Prisma has no first-class syntax for CHECK constraints, so this is
-- written directly and is NOT reproducible by regenerating this migration. Prisma
-- ignores it in drift detection, but `prisma db push` does NOT preserve hand-written
-- SQL and would silently drop it -- same trap as the CHECK constraints in the alumni-
-- polls and ProgramFAQ migrations before this one. Never run `prisma db push` against
-- this schema; always use `prisma migrate dev`/`migrate deploy`.

-- An ON_ANSWER trigger with no optionKeys would never fire (nothing to match against)
-- and would silently look like a display-triggered clip that forgot its condition; an
-- ON_DISPLAY trigger WITH optionKeys is equally nonsensical, since it fires on the
-- question's display, before any answer exists, so an optionKeys value could never be
-- consulted. Both directions are checked in one constraint so the two firing shapes
-- (find-v2-question-spec.md's "the video is conditional, not the question" cases) can
-- never be muddled by a bad admin write.
--
-- Uses cardinality(), not array_length(...,1): array_length returns NULL (not 0) for
-- an empty array, and a NULL anywhere in this OR expression makes the whole CHECK
-- evaluate to NULL -- which Postgres treats as PASSING, silently defeating the
-- constraint exactly as warned about in the ProgramFAQ migration's consent CHECK
-- above. cardinality() returns 0 for an empty array and is wrapped in COALESCE since
-- "optionKeys" (like its sibling array columns elsewhere in this schema) has no
-- NOT NULL at the SQL level, so a NULL array is coalesced to 0 rather than
-- propagating.
ALTER TABLE "FlowVideoTrigger"
  ADD CONSTRAINT "FlowVideoTrigger_option_keys_match_mode"
  CHECK (
    ("mode" = 'ON_ANSWER' AND COALESCE(cardinality("optionKeys"), 0) > 0)
    OR ("mode" = 'ON_DISPLAY' AND COALESCE(cardinality("optionKeys"), 0) = 0)
  );

-- rolloutPercent drives the spec's own "cheapest test before building any of this" as
-- a data edit (see the column's doc comment in schema.prisma) -- a value outside 0..100
-- would silently break the stable-hash rollout math rather than erroring visibly.
ALTER TABLE "FlowVideoTrigger"
  ADD CONSTRAINT "FlowVideoTrigger_rollout_percent_range"
  CHECK ("rolloutPercent" BETWEEN 0 AND 100);
