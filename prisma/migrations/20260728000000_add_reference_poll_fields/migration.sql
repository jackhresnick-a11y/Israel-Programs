-- AlterTable
ALTER TABLE "Reference" ADD COLUMN     "pollResponseId" TEXT,
ADD COLUMN     "consentLabel" TEXT,
ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "pollEmailKey" TEXT;

-- CreateIndex
-- One poll-created reference per (program, email). Postgres treats NULLs as distinct, so
-- existing signed-in reference-form rows (pollEmailKey NULL) are entirely unaffected --
-- this unique binds only the poll path and is the guarded-upsert idempotency target.
CREATE UNIQUE INDEX "Reference_programId_pollEmailKey_key" ON "Reference"("programId", "pollEmailKey");
