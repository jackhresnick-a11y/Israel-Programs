-- CreateTable
CREATE TABLE "ProgramExportRow" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramExportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramExportRow_programId_key" ON "ProgramExportRow"("programId");

-- CreateIndex
CREATE INDEX "ProgramExportRow_createdAt_idx" ON "ProgramExportRow"("createdAt");
