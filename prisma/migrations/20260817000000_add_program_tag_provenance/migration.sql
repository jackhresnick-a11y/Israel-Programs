-- Additive only. Hand-authored (not `prisma migrate dev` output) because the two foreign
-- keys below have no corresponding `@relation` field in schema.prisma -- see
-- ProgramTagProvenance's doc comment for why. Does not touch _ProgramTags or any existing
-- table. No backfill: absence of a ProgramTagProvenance row is the UNKNOWN state by
-- definition, so this migration creates an empty table, nothing else.

-- CreateEnum
CREATE TYPE "TagProvenanceSource" AS ENUM ('OFFICIAL_SITE', 'POLL_DERIVED', 'ADMIN_ASSERTED', 'INFERRED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "ProgramTagProvenance" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "source" "TagProvenanceSource" NOT NULL DEFAULT 'UNKNOWN',
    "sourceUrl" TEXT,
    "note" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTagProvenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramTagProvenance_programId_tagId_key" ON "ProgramTagProvenance"("programId", "tagId");

-- CreateIndex
CREATE INDEX "ProgramTagProvenance_source_idx" ON "ProgramTagProvenance"("source");

-- AddForeignKey
ALTER TABLE "ProgramTagProvenance" ADD CONSTRAINT "ProgramTagProvenance_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTagProvenance" ADD CONSTRAINT "ProgramTagProvenance_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
