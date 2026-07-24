-- CreateEnum
CREATE TYPE "PollQuestionTier" AS ENUM ('DEFINING', 'SIGNIFICANT', 'CONTEXTUAL', 'EXCLUDED');

-- AlterTable
ALTER TABLE "PollQuestion" ADD COLUMN     "tier" "PollQuestionTier" NOT NULL DEFAULT 'CONTEXTUAL';
