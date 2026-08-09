-- CreateTable
CREATE TABLE "FinderQuestion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "helpText" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "PollLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinderQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinderOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "PollLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "tagSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "durationValues" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "FinderOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinderQuestion_key_key" ON "FinderQuestion"("key");

-- CreateIndex
CREATE INDEX "FinderOption_questionId_idx" ON "FinderOption"("questionId");

-- AddForeignKey
ALTER TABLE "FinderOption" ADD CONSTRAINT "FinderOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "FinderQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
