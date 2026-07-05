/*
  Warnings:

  - You are about to drop the column `published` on the `Program` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "ProgramEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "programId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "ProgramEdit_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Program" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "logoUrl" TEXT,
    "organization" TEXT,
    "location" TEXT,
    "durationType" TEXT NOT NULL,
    "durationText" TEXT,
    "cost" TEXT,
    "signupInstructions" TEXT,
    "signupUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactWebsite" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Program" ("contactEmail", "contactPhone", "contactWebsite", "cost", "createdAt", "createdById", "description", "durationText", "durationType", "id", "location", "logoUrl", "name", "organization", "signupInstructions", "signupUrl", "slug", "updatedAt") SELECT "contactEmail", "contactPhone", "contactWebsite", "cost", "createdAt", "createdById", "description", "durationText", "durationType", "id", "location", "logoUrl", "name", "organization", "signupInstructions", "signupUrl", "slug", "updatedAt" FROM "Program";
DROP TABLE "Program";
ALTER TABLE "new_Program" RENAME TO "Program";
CREATE UNIQUE INDEX "Program_slug_key" ON "Program"("slug");
CREATE INDEX "Program_durationType_idx" ON "Program"("durationType");
CREATE INDEX "Program_status_idx" ON "Program"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProgramEdit_programId_idx" ON "ProgramEdit"("programId");

-- CreateIndex
CREATE INDEX "ProgramEdit_status_idx" ON "ProgramEdit"("status");
