-- CreateEnum
CREATE TYPE "TravelType" AS ENUM ('SINGLE_LOCATION', 'MULTI_CITY_TOURING');

-- CreateEnum
CREATE TYPE "FieldDecisionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "hasCollegeCredit" BOOLEAN,
ADD COLUMN     "hasScholarship" BOOLEAN,
ADD COLUMN     "travelType" "TravelType";

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "category" TEXT;

-- CreateTable
CREATE TABLE "ProgramEditFieldDecision" (
    "id" TEXT NOT NULL,
    "editId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "proposedValue" TEXT,
    "finalValue" TEXT,
    "decision" "FieldDecisionStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ProgramEditFieldDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramEditFieldDecision_editId_fieldName_key" ON "ProgramEditFieldDecision"("editId", "fieldName");

-- AddForeignKey
ALTER TABLE "ProgramEditFieldDecision" ADD CONSTRAINT "ProgramEditFieldDecision_editId_fkey" FOREIGN KEY ("editId") REFERENCES "ProgramEdit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
