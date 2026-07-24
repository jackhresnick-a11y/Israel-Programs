-- AlterTable
ALTER TABLE "PollQuestion" ADD COLUMN     "highPhrase" TEXT,
ADD COLUMN     "lowPhrase" TEXT;

-- AlterTable
ALTER TABLE "ProgramPollConfig" ADD COLUMN     "editorialBestFor" TEXT;
