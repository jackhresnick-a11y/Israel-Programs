-- AlterTable
ALTER TABLE "PollResponse" ADD COLUMN     "ageAttested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referenceEmail" TEXT;
