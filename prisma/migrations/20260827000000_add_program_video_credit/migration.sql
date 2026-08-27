-- Additive only: two new public columns on Program, no backfill and no data movement.
-- NOT applied by this change -- see CLAUDE.md's "Database writes" rule. Apply to
-- production BEFORE merging (migration ordering is code-last), or listProgramsBestFor's
-- select throws P2022 on every /admin/programs load.
ALTER TABLE "Program" ADD COLUMN     "videoCredit" TEXT;
ALTER TABLE "Program" ADD COLUMN     "videoCreditUrl" TEXT;
