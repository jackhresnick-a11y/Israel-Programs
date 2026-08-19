-- Additive only: two new nullable columns on Reference, no backfill and no data movement.
-- NOT applied by this change -- see CLAUDE.md's "Database writes" rule and the migrations
-- already pending against this database.
--
-- Safe in both orderings, but apply this to production BEFORE merging (the repo's
-- code-last rule): code deployed ahead of it degrades rather than throws, because every
-- read that touches these columns goes through lib/references.ts's emptyIfColumnMissing,
-- and the one write path (upsertReferenceFromPoll) is already wrapped best-effort by
-- finalizeReferenceFromPoll.
ALTER TABLE "Reference" ADD COLUMN     "removalToken" TEXT;
ALTER TABLE "Reference" ADD COLUMN     "removedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Reference_removalToken_key" ON "Reference"("removalToken");
