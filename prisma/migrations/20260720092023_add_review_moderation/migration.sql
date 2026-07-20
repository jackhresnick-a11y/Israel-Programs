-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

-- DropIndex
DROP INDEX "Review_programId_idx";

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderatedBy" TEXT,
ADD COLUMN     "moderatorNote" TEXT,
ADD COLUMN     "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Review_programId_status_idx" ON "Review"("programId", "status");

-- CreateIndex
CREATE INDEX "Review_status_idx" ON "Review"("status");

-- Backfill: every row that already existed was already live and public under the old
-- unmoderated flow -- grandfather it as PUBLISHED rather than retroactively hiding real
-- reviews visitors have always been able to see. isAnonymous's column default (false)
-- is already correct for these rows (the old flow always showed the name).
UPDATE "Review" SET "status" = 'PUBLISHED';
