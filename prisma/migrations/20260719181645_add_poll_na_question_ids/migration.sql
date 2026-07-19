-- AlterTable
ALTER TABLE "PollResponse" ADD COLUMN     "naQuestionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
