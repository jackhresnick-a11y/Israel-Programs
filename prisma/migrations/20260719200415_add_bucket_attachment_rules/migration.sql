-- CreateTable
CREATE TABLE "BucketAttachmentRule" (
    "id" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "tagSlugs" TEXT[],
    "status" "PollLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BucketAttachmentRule_pkey" PRIMARY KEY ("id")
);
