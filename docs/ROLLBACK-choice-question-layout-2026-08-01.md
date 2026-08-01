# Rollback: poll choice-question layout + PollQuestion.optionKind (2026-08-01)

Recorded at go-live time for the `poll/choice-question-layout` production deploy. This
deploy has one additive migration plus one single-row data write. Reverting the Vercel
deployment alone undoes **neither** — both are separate steps below.

## 1. Code-side rollback target

**Previous production deployment:** `https://israel-programs-qftzwaoyv-jack-r.vercel.app`
(master @ `5f2981f8520b2190177734d28986890a03c4f48a`, "Merge pull request #4 from
jackhresnick-a11y/poll-restructure")

```
vercel rollback https://israel-programs-qftzwaoyv-jack-r.vercel.app --scope jack-r
```

## 2. Down-migration SQL

Unlike some earlier rollback docs in this repo, this one is **fully reversible** — this
migration adds a whole new enum *type*, not a value to an existing enum, so `DROP TYPE`
is legal once the only column referencing it is gone.

```sql
-- Reverses 20260801182239_add_poll_question_option_kind
-- Order matters: the column must go before the type it references.
ALTER TABLE "PollQuestion" DROP COLUMN "optionKind";
DROP TYPE "PollOptionKind";
```

**Run this against the production `DATABASE_URL` via:**

```
npx prisma db execute --stdin <<< '<sql above>'
```

**Not** `prisma migrate` — this is a manual reversal, not a forward migration path.

## 3. Data-write reversal (separate from the schema rollback)

The single-row classification is a separate decision from the column existing at all —
use this alone if only the classification, not the column, needs undoing:

```sql
-- Reverses prisma/set-unit-assignments-option-kind.ts
-- NULL is the "derive" state, i.e. renders ordinal, i.e. exactly pre-deploy behaviour.
UPDATE "PollQuestion" SET "optionKind" = NULL WHERE "key" = 'unit_assignments';
```

Full prior state of every row's `optionKind` (all `NULL`, since this is the column's
first-ever write) is snapshotted at `data/poll-optionkind-before-2026-08-01.json` —
restoring from it is a no-op loop, since nothing but `unit_assignments` was ever touched.

Dropping the column on rollback is optional — leaving `optionKind` in place after
reverting the code is inert, since nothing but the reverted code ever reads it.

## Notes

- Verified forward and backward (including this exact down-SQL) on a throwaway Neon
  branch (`optionkind-migration-test`, cut from `br-rapid-fire-atd2x2se`) before this
  deploy — the branch has since been deleted.
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  against the branch after applying the migration returned the empty migration (zero
  drift between the hand-written SQL and `schema.prisma`).
- Row counts (verified against the throwaway branch, then reproduced against production
  at deploy time): `PollQuestion` total unchanged before/after (55); `optionKind`
  non-null count 0 → 1 (`unit_assignments` only).
- **No question text, option label, anchor label, or bucket membership was modified
  anywhere in this deploy** — `prisma/seed-polls.ts`, `prisma/seed-tiers.ts`, and
  `prisma/seed-best-for.ts` are all zero-diff against `master`. The migration adds one
  nullable column; the data script writes one enum value to one row's `optionKind`
  column only (its `data` object never references `labels` or `text`).
- The rendering change (SegmentedScale/StackedChoice/NaOptOut/QuestionInput) reads
  `optionKind` but writes nothing — it has no separate rollback of its own beyond the
  Vercel deployment rollback in §1.
