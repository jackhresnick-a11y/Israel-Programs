-- CreateEnum
CREATE TYPE "PollScaleType" AS ENUM ('EVALUATIVE', 'DESCRIPTIVE');

-- AlterTable
ALTER TABLE "PollQuestion" ADD COLUMN     "scaleType" "PollScaleType" NOT NULL DEFAULT 'EVALUATIVE';
