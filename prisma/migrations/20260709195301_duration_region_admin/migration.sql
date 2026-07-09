-- CreateTable
CREATE TABLE "DurationOption" (
    "id" TEXT NOT NULL,
    "value" "DurationType" NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "showInFilter" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DurationOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "memberSlugs" TEXT[],

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DurationOption_value_key" ON "DurationOption"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Region_slug_key" ON "Region"("slug");
