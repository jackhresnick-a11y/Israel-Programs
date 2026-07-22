-- CreateEnum
CREATE TYPE "ReferenceVisibility" AS ENUM ('AUTO', 'FORCE_SHOW', 'FORCE_HIDE');

-- AlterEnum
BEGIN;
CREATE TYPE "ContactRequestStatus_new" AS ENUM ('AWAITING_ALUMNUS', 'APPROVED', 'DECLINED', 'EXPIRED');
ALTER TABLE "public"."ContactRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ContactRequest" ALTER COLUMN "status" TYPE "ContactRequestStatus_new" USING ("status"::text::"ContactRequestStatus_new");
ALTER TYPE "ContactRequestStatus" RENAME TO "ContactRequestStatus_old";
ALTER TYPE "ContactRequestStatus_new" RENAME TO "ContactRequestStatus";
DROP TYPE "public"."ContactRequestStatus_old";
ALTER TABLE "ContactRequest" ALTER COLUMN "status" SET DEFAULT 'AWAITING_ALUMNUS';
COMMIT;

-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "reminderSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "token" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'AWAITING_ALUMNUS';

-- AlterTable
ALTER TABLE "Reference" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentGiven" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReferenceConfig" (
    "programId" TEXT NOT NULL,
    "visibility" "ReferenceVisibility" NOT NULL DEFAULT 'AUTO',
    "unlockedAt" TIMESTAMP(3),
    "minToShow" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "ReferenceConfig_pkey" PRIMARY KEY ("programId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactRequest_token_key" ON "ContactRequest"("token");

-- CreateIndex
CREATE INDEX "ContactRequest_status_createdAt_idx" ON "ContactRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ReferenceConfig" ADD CONSTRAINT "ReferenceConfig_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

