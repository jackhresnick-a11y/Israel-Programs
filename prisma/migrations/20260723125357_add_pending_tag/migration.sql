-- CreateEnum
CREATE TYPE "PendingTagStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PendingTag" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "status" "PendingTagStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingTag_status_idx" ON "PendingTag"("status");

-- CreateIndex
CREATE INDEX "PendingTag_programId_idx" ON "PendingTag"("programId");

-- AddForeignKey
ALTER TABLE "PendingTag" ADD CONSTRAINT "PendingTag_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
