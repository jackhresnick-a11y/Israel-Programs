# Rollback: poll restructure wave 1 (2026-07-31)

Recorded before the `poll-restructure` production deploy (PR #4, which merges PR #3 in
as its base). Unlike the autosave go-live, this deploy has exactly **one** migration and
it is fully additive and fully reversible — no enum, no dropped/altered column.

## 1. Code-side rollback target

**Previous production deployment ID:** `dpl_7FHNM92NWb6HPw9nFiHFp46ExF64`
`https://israel-programs-ommghzpeq-jack-r.vercel.app`
(commit `cd5bb4a`, master HEAD before this deploy)

```
vercel rollback https://israel-programs-ommghzpeq-jack-r.vercel.app --scope jack-r
```

## 2. Down-migration SQL

The only migration in this deploy, `20260731154418_add_analytics_event_poll_program_index`,
adds exactly one schema object: an expression index on `AnalyticsEvent`. No table, no
column, no enum. Fully reversible — a plain `DROP INDEX`, tested end-to-end (forward then
backward) against a throwaway Neon branch cut from production data (`460` `Program` rows,
`5466` `AnalyticsEvent` rows, `218` `PollResponse` rows — all three counts identical before
the migration, after applying it, and after reversing it; branch deleted once confirmed).

```sql
-- Reverses 20260731154418_add_analytics_event_poll_program_index
DROP INDEX IF EXISTS "AnalyticsEvent_type_payload_programId_idx";
```

**Run this against the production `DATABASE_URL` via:**

```
npx prisma db execute --stdin <<< '<sql above>'
```

**Not** `prisma migrate` — same posture as every other rollback in this codebase's
migrations: this is a manual reversal, not a forward migration path back down.

Dropping the index does not disable the funnel event writers
(`lib/pollAnalytics.ts`) — they'd keep writing rows, just slower to aggregate. If a full
rollback of the funnel feature is ever needed (not expected), that's a code-side revert
of the `poll-restructure` commits, not a schema change.

## Notes

- The migration is additive-only: it adds exactly one index and touches zero existing
  rows. No poll question text, anchor labels, bucket names, or bucket membership were
  touched — items 2, 3, and 7 of the poll restructure brief are deliberately held out of
  this deploy; `prisma/seed-polls.ts` and every `BucketAttachmentRule` row are untouched.
- The throwaway Neon branch used to test both the forward and down migration
  (`br-nameless-firefly-at5hv9gs`, since deleted) was cut from **production** data via
  `neonctl branches create --parent br-rapid-fire-atd2x2se`, not an empty branch — the
  460/5466/218 row counts above are the evidence.
- `lib/pollAnalytics.ts`'s two `after()`-wrapping `try/catch` blocks (added this deploy,
  covering `after()` throwing synchronously outside a request scope, not just a write
  failure) both call `console.error(...)` on the caught error; neither swallows silently.
