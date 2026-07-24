-- AlterTable
ALTER TABLE "PollResponse" ADD COLUMN     "contactAgeAttested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contactAgeAttestedAt" TIMESTAMP(3),
ADD COLUMN     "contactMethod" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contactOptInAt" TIMESTAMP(3);
