-- AlterEnum
ALTER TYPE "PollReviewStatus" ADD VALUE 'ARCHIVED';

-- AlterEnum
ALTER TYPE "ReviewStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "PollReview" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedBy" TEXT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedBy" TEXT;
