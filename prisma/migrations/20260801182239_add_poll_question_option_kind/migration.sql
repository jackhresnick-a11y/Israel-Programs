-- CreateEnum
CREATE TYPE "PollOptionKind" AS ENUM ('ORDINAL', 'CATEGORICAL');

-- AlterTable
ALTER TABLE "PollQuestion" ADD COLUMN     "optionKind" "PollOptionKind";
