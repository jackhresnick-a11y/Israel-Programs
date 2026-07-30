# Rollback: poll autosave + per-question publishing (2026-07-30)

Recorded at go-live time for the `poll/autosave-per-question` production deploy (PR #2).
Both parts below are needed — reverting the Vercel deployment alone does **not** undo the
schema change.

## 1. Code-side rollback target

**Previous production deployment ID:** `dpl_6NT3SWfqysaYG11xR1JGa6WF8vfP`
`https://israel-programs-lqzrq3v4n-jack-r.vercel.app`

```
vercel rollback https://israel-programs-lqzrq3v4n-jack-r.vercel.app --scope jack-r
```

(New production deployment being rolled back from, for reference: `dpl_2zvXRq7mRrnvjz3YBtS4jzuUnuv7`
— `https://israel-programs-ksgsrjsvp-jack-r.vercel.app`.)

## 2. Down-migration SQL

Only two of the three migrations in this deploy are reversible; the enum addition is not
(Postgres has no `DROP VALUE`).

```sql
-- Reverses 20260730145149_add_question_createdat_and_grandfathered_questions
ALTER TABLE "PollQuestion" DROP COLUMN "createdAt";
ALTER TABLE "ProgramPollConfig" DROP COLUMN "grandfatheredQuestionIds";

-- Reverses 20260730092406_add_poll_response_reference_staging_fields
ALTER TABLE "PollResponse" DROP COLUMN "referenceEmail";
ALTER TABLE "PollResponse" DROP COLUMN "ageAttested";

-- 20260730090933_add_poll_response_incomplete_status has NO down —
-- Postgres cannot remove an enum value. If rolled back, INCOMPLETE
-- stays in the enum, unused and harmless.
```

**Run this against the production `DATABASE_URL` via:**

```
npx prisma db execute --stdin <<< '<sql above>'
```

**Not** `prisma migrate` — there is no forward migration path back down this chain; this is
a manual reversal, same posture as every other rollback in this codebase's migrations.

## Notes

- Both migrations applied in this deploy were additive-only; no poll question text, anchor
  labels, bucket names, or bucket membership were touched (`prisma/seed-polls.ts` has zero
  diff against `master`).
- Migration row counts recorded at deploy time: `PollResponse` 204 rows before/after
  (unchanged); `PollQuestion` 55 rows before/after (unchanged; 44 backfilled to a real
  historical `createdAt`, 11 left at migration-time default, never answered);
  `ProgramPollConfig` 460 rows before/after (unchanged; 22 rows backfilled with
  `grandfatheredQuestionIds`, 551 (program, question) pairs total).
