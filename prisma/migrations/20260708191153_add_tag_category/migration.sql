-- CreateTable
CREATE TABLE "TagCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "tint" TEXT NOT NULL DEFAULT 'accent',
    "showInFilter" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TagCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TagCategory_slug_key" ON "TagCategory"("slug");
