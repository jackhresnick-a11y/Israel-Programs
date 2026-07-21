-- AlterTable
ALTER TABLE "BucketAttachmentRule" ADD COLUMN     "durationTypes" "DurationType"[] DEFAULT ARRAY[]::"DurationType"[];
