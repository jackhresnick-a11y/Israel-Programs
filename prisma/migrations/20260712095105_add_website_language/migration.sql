-- CreateEnum
CREATE TYPE "WebsiteLanguage" AS ENUM ('ENGLISH', 'HEBREW', 'BOTH');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "websiteLanguage" "WebsiteLanguage";
