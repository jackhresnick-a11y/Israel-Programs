-- CreateEnum
CREATE TYPE "EmailVerificationStatus" AS ENUM ('VERIFIED', 'BOUNCED', 'WRONG_CONTACT');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "contactEmailStatus" "EmailVerificationStatus";

-- CreateTable
CREATE TABLE "ContactEmailVerification" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "EmailVerificationStatus" NOT NULL,
    "note" TEXT,
    "checkedById" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactEmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactEmailVerification_programId_idx" ON "ContactEmailVerification"("programId");

-- AddForeignKey
ALTER TABLE "ContactEmailVerification" ADD CONSTRAINT "ContactEmailVerification_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
