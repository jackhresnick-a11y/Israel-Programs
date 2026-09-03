-- Additive: two new tables (Transcript, ProgramBrief), one new config table
-- (BriefType), one new enum. NOT applied by this change -- see CLAUDE.md's
-- "Database writes" rule. Every read path in lib/transcripts.ts/lib/briefs.ts
-- degrades to empty rather than throwing if this hasn't been applied yet (P2021/
-- P2022), since Vercel previews run against the production DB -- see
-- lib/pollElaborations.ts's isMissingTableError for the precedent this follows.

-- CreateEnum
CREATE TYPE "ProgramBriefStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "sendToAssistant" BOOLEAN NOT NULL DEFAULT false,
    "supersedesAiBrief" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramBrief" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "briefTypeId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "status" "ProgramBriefStatus" NOT NULL DEFAULT 'DRAFT',
    "promptVersionUsed" INTEGER NOT NULL,
    "needsRegeneration" BOOLEAN NOT NULL DEFAULT false,
    "insufficient" BOOLEAN NOT NULL DEFAULT false,
    "insufficientAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transcript_programId_idx" ON "Transcript"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefType_slug_key" ON "BriefType"("slug");

-- CreateIndex
CREATE INDEX "ProgramBrief_programId_status_idx" ON "ProgramBrief"("programId", "status");

-- CreateIndex
CREATE INDEX "ProgramBrief_briefTypeId_idx" ON "ProgramBrief"("briefTypeId");

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramBrief" ADD CONSTRAINT "ProgramBrief_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramBrief" ADD CONSTRAINT "ProgramBrief_briefTypeId_fkey" FOREIGN KEY ("briefTypeId") REFERENCES "BriefType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-added below: Prisma has no first-class syntax for partial (WHERE-qualified)
-- unique indexes, so this is written directly and is NOT reproducible by
-- regenerating this migration. Prisma ignores it in drift detection, so it will
-- never show up as "unexpected" -- but `prisma db push` does NOT preserve
-- hand-written SQL and would silently drop it. Never run `prisma db push` against
-- this schema; always use `prisma migrate dev`/`migrate deploy`. Same posture as
-- the two partial unique indexes in 20260717122617_add_alumni_polls.

-- Exactly one non-ARCHIVED brief per (program, brief type). An "insufficient" marker
-- IS that row (status DRAFT, text '', insufficient=true), so it occupies the single
-- slot and pasting real text updates it in place -- the uniqueness holds with those
-- rows present, by construction rather than by a carve-out.
CREATE UNIQUE INDEX "ProgramBrief_programId_briefTypeId_active_key"
  ON "ProgramBrief" ("programId", "briefTypeId")
  WHERE "status" <> 'ARCHIVED';

-- Idempotent legacy backfill: one Transcript row per program that still carries a
-- non-empty Program.videoTranscript (a column this migration supersedes but does not
-- drop -- see the doc comment on Program.videoTranscript in schema.prisma). Safe to
-- run twice: the NOT EXISTS guard on the 'legacy-<slug>' filename makes a second run
-- a no-op. Skips whitespace-only values, not just NULL. Verified against production
-- on 2026-09-03: 0 programs currently have a non-empty videoTranscript, so this
-- produces 0 rows today -- included anyway so any transcript ingested between now and
-- when this migration is applied is not silently dropped.
INSERT INTO "Transcript" ("id", "programId", "text", "filename", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", p."videoTranscript",
       'legacy-' || p."slug", now(), now()
FROM "Program" p
WHERE p."videoTranscript" IS NOT NULL
  AND length(btrim(p."videoTranscript")) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "Transcript" t
    WHERE t."programId" = p."id" AND t."filename" = 'legacy-' || p."slug"
  );
