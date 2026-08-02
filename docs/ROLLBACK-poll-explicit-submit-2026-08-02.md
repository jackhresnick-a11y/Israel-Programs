# Rollback: explicit poll submit button (2026-08-02)

Recorded before the `feature/poll-explicit-submit` production deploy. **Unlike the referral
loop deploy that precedes it, this one has a migration** — both parts below are needed;
reverting the Vercel deployment alone does not undo the schema change.

## 1. Code-side rollback target

**Previous production deployment ID:** `dpl_3ZXUyTitd4MqkRAdjQVx1ZLPynMA`
`https://israel-programs-czfvoj4r4-jack-r.vercel.app`

```
vercel rollback https://israel-programs-czfvoj4r4-jack-r.vercel.app --scope jack-r
```

(Update this to whatever is actually live at go-live time if the referral-loop deploy lands
first — `vercel ls israel-programs --prod --scope jack-r` gives the current one.)

## 2. Down-migration SQL

Fully reversible — one additive nullable column, no backfill, no constraint.

```sql
-- Reverses 20260802105354_add_poll_response_submitted_at
ALTER TABLE "PollResponse" DROP COLUMN "submittedAt";
```

**Run this against the production `DATABASE_URL` via:**

```
npx prisma db execute --stdin <<< 'ALTER TABLE "PollResponse" DROP COLUMN "submittedAt";'
```

**Not** `prisma migrate` — there is no forward migration path back down this chain; this is
a manual reversal, same posture as every other rollback in this codebase's migrations. And
never `prisma db push` against this schema — it silently drops the hand-added CHECK
constraints and partial indexes on the poll tables.

Rolling the column back is safe with the old code deployed: nothing before this change reads
or writes `submittedAt`.

## 3. What rolling back restores (and what it doesn't)

Reverting the code restores the previous behavior — no submit button, and the thank-you
screen firing automatically the moment autosave crosses the readiness bar. Note the
consequences, since they are the bugs this deploy fixed:

- **The poll → pending-reference pipeline goes back to being dead.** Reference creation
  moves back inside `maybeTransition`, which fires before the respondent has reached the
  contact-email field at the bottom of the form, so `referenceEmail` is null and no
  `Reference` is ever created. Any references created while this deploy was live are
  ordinary rows and survive the rollback untouched.
- The form goes back to being replaced mid-poll at bar-crossing, losing the respondent's
  access to any remaining questions.
- The site-wide footer's "Ask us" lead form reappears directly beneath the poll.

## Notes

- **Counting is untouched by this deploy in both directions.** `submittedAt` is orthogonal
  to `status`; submitting never writes `status`, `flags`, `verified`, or any `PollAnswer`
  row. Public aggregates (`lib/pollResults.ts`, all joined on `status = "COUNTED"`) produce
  identical numbers before, during, and after — so no score can move as a result of either
  deploying or rolling back this change.
- One new event type is written into the existing generic `AnalyticsEvent` table:
  `poll_submitted`. Rolling back stops new rows; existing ones are inert.
- No poll question text, anchor labels, or bucket membership were touched.
- Row counts recorded before this deploy: `PollResponse` 226 rows (all with
  `submittedAt` null after the migration, by definition); `Reference` unchanged by the
  migration itself.
- `components/polls/RateForm.tsx`'s `ContactOptInBlock` (the signed-in "I'm open to being
  contacted" checkbox) was removed from the UI, but every server-side column, writer, and
  reader for it was deliberately left in place — historical `contactOptIn` rows still render
  in `/admin/programs`. A rollback restores the input with no data migration needed.
