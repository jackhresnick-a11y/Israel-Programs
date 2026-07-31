-- Hand-written: Prisma's schema.prisma has no syntax for an expression index, so this
-- has no corresponding schema.prisma change -- same "no first-class syntax" situation
-- as the hand-appended CHECK constraints elsewhere in this schema. Never run
-- `prisma db push` against this schema; it would silently drop this index.
--
-- Speeds up the admin funnel's per-program aggregation (lib/pollFunnel.ts) and the
-- poll_fully_completed idempotency check (lib/pollAnalytics.ts's
-- trackPollFullyCompletedIfNew), both of which filter AnalyticsEvent on
-- (type, payload->>'programId'/'responseId'). Purely additive: touches no existing row.
-- Deliberately NOT `CONCURRENTLY` -- Prisma Migrate applies each migration.sql inside a
-- transaction, and CREATE INDEX CONCURRENTLY cannot run inside one (Postgres rejects
-- it outright). AnalyticsEvent is a low-write-volume table, so the brief SHARE lock a
-- plain CREATE INDEX takes is an acceptable tradeoff here.
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_type_payload_programId_idx"
  ON "AnalyticsEvent" ("type", (payload ->> 'programId'));
