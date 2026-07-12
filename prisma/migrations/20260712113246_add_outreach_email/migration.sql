-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'BOUNCED', 'REPLIED', 'WRONG_CONTACT');

-- CreateTable
CREATE TABLE "OutreachEmail" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'DRAFT',
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "resendId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutreachEmail_programId_key" ON "OutreachEmail"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachEmail_resendId_key" ON "OutreachEmail"("resendId");

-- CreateIndex
CREATE INDEX "OutreachEmail_status_idx" ON "OutreachEmail"("status");

-- AddForeignKey
ALTER TABLE "OutreachEmail" ADD CONSTRAINT "OutreachEmail_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
