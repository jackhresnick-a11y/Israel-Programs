-- CreateEnum
CREATE TYPE "SchoolSize" AS ENUM ('BIG', 'SMALL');

-- CreateEnum
CREATE TYPE "CounselorOutreachStatus" AS ENUM ('NOT_CONTACTED', 'CONTACTED', 'REPLIED', 'BOUNCED', 'WRONG_CONTACT');

-- CreateTable
CREATE TABLE "CounselorContact" (
    "id" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "cityRegion" TEXT NOT NULL,
    "schoolSize" "SchoolSize",
    "contactName" TEXT,
    "email" TEXT NOT NULL,
    "emailIsGeneric" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT NOT NULL,
    "notes" TEXT,
    "status" "CounselorOutreachStatus" NOT NULL DEFAULT 'NOT_CONTACTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CounselorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounselorContactEvent" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "CounselorOutreachStatus" NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounselorContactEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CounselorContact_country_idx" ON "CounselorContact"("country");

-- CreateIndex
CREATE INDEX "CounselorContact_status_idx" ON "CounselorContact"("status");

-- CreateIndex
CREATE INDEX "CounselorContact_createdAt_idx" ON "CounselorContact"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CounselorContact_schoolName_country_key" ON "CounselorContact"("schoolName", "country");

-- CreateIndex
CREATE INDEX "CounselorContactEvent_contactId_idx" ON "CounselorContactEvent"("contactId");

-- AddForeignKey
ALTER TABLE "CounselorContactEvent" ADD CONSTRAINT "CounselorContactEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CounselorContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
