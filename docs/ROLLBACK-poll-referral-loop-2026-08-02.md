# Rollback: post-submission poll referral loop (2026-08-02)

Recorded before the `feature/poll-referral-loop` production deploy. **This deploy is
code-only — no migration was applied and no down-SQL exists.** Rolling back the Vercel
deployment alone fully reverses it.

## 1. Code-side rollback target

**Previous production deployment ID:** `dpl_3ZXUyTitd4MqkRAdjQVx1ZLPynMA`
`https://israel-programs-czfvoj4r4-jack-r.vercel.app`

```
vercel rollback https://israel-programs-czfvoj4r4-jack-r.vercel.app --scope jack-r
```

## 2. Down-migration SQL

None. Every field this feature reads (`PollResponse.createdAt`, `yearAttended`,
`programId`, `status`; `ProgramPollConfig.pollLinkPublic`/`publicToken`;
`AnalyticsEvent {type, payload, createdAt}`) already existed before this deploy. No
`prisma/migrations/*` folder was added, so there is nothing to reverse at the database
level — `vercel rollback` alone is sufficient.

## Notes

- Two new event type strings are written into the existing generic `AnalyticsEvent` table:
  `share_button_shown` and `share_button_clicked` (see `lib/pollShared.ts`'s
  `POLL_SHARE_EVENTS`). Rolling back the deployment stops new rows of these types from
  being written; any already written are harmless, inert rows with no schema impact and no
  code path (after rollback) that reads them.
- No poll question text, anchor labels, bucket names, or bucket membership were touched
  anywhere in this deploy — changes are confined to `lib/pollAnalytics.ts`,
  `lib/pollClustering.ts` (new), `lib/pollShare.ts` (new), `lib/pollClientEvents.ts` (new),
  `lib/pollShared.ts`, `lib/pollResults.ts` (`listRatingCoverage` and
  `getProgramPollSummary`'s public DTO only), `lib/pollFunnel.ts`,
  `components/polls/RateForm.tsx` (thank-you states only — question rendering, autosave,
  and debounce logic untouched), `components/polls/ThankYouPanel.tsx` (new),
  `components/polls/ProgramProgressLine.tsx` (new),
  `components/polls/WhatsAppShareButton.tsx` (new),
  `components/admin/polls/RatingCoverageTable.tsx`,
  `components/admin/polls/PollFunnelSummary.tsx`,
  `app/rate/[programSlug]/page.tsx`, and two new API routes
  (`app/api/polls/events/route.ts`, `app/api/polls/programs/[programId]/response-count/route.ts`).
- The autosave routes (`open`, `answer`, `details`) and the readiness-bar/unlock logic
  (`lib/pollUnlock.ts`, `lib/pollResponses.ts`'s `maybeTransition`) were not modified.
- Row counts recorded before this deploy: `PollResponse` 226 rows; `AnalyticsEvent` 5,588
  rows. Both are expected to only grow (new response rows from ordinary poll traffic, new
  `share_button_shown`/`share_button_clicked` event rows from this feature) — no existing
  row is modified or deleted by this deploy.
