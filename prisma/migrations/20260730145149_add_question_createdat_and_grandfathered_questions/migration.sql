-- AlterTable
ALTER TABLE "PollQuestion" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ProgramPollConfig" ADD COLUMN     "grandfatheredQuestionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
