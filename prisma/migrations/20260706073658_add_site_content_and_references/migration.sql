-- CreateEnum
CREATE TYPE "ContactRequestStatus" AS ENUM ('OPEN', 'REPLIED');

-- CreateTable
CREATE TABLE "SiteContent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "attendedText" TEXT NOT NULL,
    "note" TEXT,
    "contactEmail" TEXT NOT NULL,
    "status" "ProgramStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "note" TEXT,
    "status" "ContactRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteContent_key_key" ON "SiteContent"("key");

-- CreateIndex
CREATE INDEX "Reference_programId_idx" ON "Reference"("programId");

-- CreateIndex
CREATE INDEX "Reference_status_idx" ON "Reference"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Reference_programId_userId_key" ON "Reference"("programId", "userId");

-- CreateIndex
CREATE INDEX "ContactRequest_referenceId_idx" ON "ContactRequest"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactRequest_referenceId_requesterUserId_key" ON "ContactRequest"("referenceId", "requesterUserId");

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
