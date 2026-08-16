-- Additive only: four new columns on Program, no backfill and no data movement.
-- NOT applied by this change -- see CLAUDE.md's "Database writes" rule and the two
-- other migrations already pending against this database.
ALTER TABLE "Program" ADD COLUMN     "videoUrl" TEXT;
ALTER TABLE "Program" ADD COLUMN     "videoTranscript" TEXT;
ALTER TABLE "Program" ADD COLUMN     "aiBrief" TEXT;
ALTER TABLE "Program" ADD COLUMN     "transcriptTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
