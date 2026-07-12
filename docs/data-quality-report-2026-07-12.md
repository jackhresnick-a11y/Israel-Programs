# Israel Programs Wiki — data-quality cleanup + priority additions report

**Date:** 2026-07-12
**Scope:** Full 372-program live directory in the shared Neon database (this repo *is*
israelprogramswiki.com — all changes below were applied directly to production, not a
scraped copy).

## Starting state vs. ending state

- Started at 362 published programs, ended at **372** (7 Tier 1/2/3 additions + 3
  Gate-2 Birthright organizer additions).
- Snapshots of every prior value before any write live in `data/snapshots/`:
  `duplicated-descriptions-2026-07-12.json`, `cost-mentions-2026-07-12.json`,
  `jewel-for-women-cost-2026-07-12.json`, `taxonomy-2026-07-12.json`.

## Workstream 1 — Audit

### Auto-fixes applied
- **Duplicated description**: only `jewel-for-women` actually had one (verified via a
  whole-description-doubling + sentence-level duplicate detector across all 362
  descriptions). `ohrsom`, which the original task named as a suspected duplicate, was
  checked and is **not** duplicated — its 530-character description appears once. It
  does have second-person marketing voice ("If you are a South African or Australian
  looking to see the globe..."), which is filed under first-person voice below instead.
- **Cost/price stripped** from 13 descriptions: `aish-hatorah-essentials-program`,
  `arava-institute-for-environmental-studies`, `birthright-israel` (removed "free," then
  restored per explicit instruction — see below), `conservative-yeshiva`,
  `eco-israel-program`, `jewel-for-women`, `kibbutz-program-center-kpc`,
  `masa-israel-teaching-fellows-mitf`, `nativ-track-aardvark-israel`,
  `new-israel-fund-shatil-social-justice-fellowship`, `otzma`, `tel-gezer-excavation`,
  `tel-megiddo-excavation`. Two regex hits were confirmed false positives and left
  untouched: `camera-fellows-...`'s "a free weekend" (unscheduled time, not price) and
  `tel-gezer-excavation`'s "instead of paid laborers" (historical dig-methodology fact).
- **User correction applied**: "free" was reinstated in `birthright-israel`'s
  description per explicit instruction — "anything that's free is an exception to the
  [no-pricing] rule." Recorded as a standing project memory for future sessions.
- **Bonus finding/fix**: `nativ-track-aardvark-israel`'s description had a full
  research-caveat sentence sitting in the public-facing field ("IMPORTANT FLAG: ...
  confirm current logistics, dates, and costs before publishing as final"), with
  `adminNote` sitting null. Moved the caveat to `adminNote` rather than deleting it,
  per the description/adminNote separation rule in CLAUDE.md.

### Flagged (report-only, no changes made)
- **Missing locations** (breaks the Region filter both directly and via tags — none of
  these 5 has a location-category tag either): `jcc-maccabi-israel-sports-tour`,
  `midreshet-torah-vavodah-mtva`, `ncsy-kollel-mechina-track`, `ohrsom`,
  `yeshivat-torah-vavodah-ytva`.
- **Essence-tag coverage**: not as sparse as the original request assumed
  (`essence-spiritual-growth` 190, `essence-academic-internship` 66, `essence-pre-military`
  60, `essence-travel` 35 programs, out of 362 pre-taxonomy-pass). Keyword-signal gap
  analysis found candidate under-tagging: 27 programs read as academic/internship-flavored
  but lack the tag, 66 read as pre-military-flavored but lack it, 6 read as
  spiritual-growth-flavored but lack it, 12 read as travel-flavored but lack it. Full
  slug lists in `data/audit-2026-07-12-findings.json` under `essenceCoverageGaps` —
  left un-applied since essence-tag assignment is a judgment call about program
  character, not a mechanical fix.
- **First-person/marketing voice**: a first regex pass falsely flagged 6 programs by
  matching "US" (the country abbreviation, e.g. "students from the US") as the pronoun
  "us" — corrected with a case-sensitive pass. The one real violator: `ohrsom`.
  `bnei-david-eli` reads as promotional in tone ("the ultimate goal is to give students
  the values, resilience, and tools they need for life") without literal first-person
  pronouns — flagged separately, tied to the duplicate-entry issue below.
- **Duration encoded twice** (the actual issue behind the "age encoded twice" report
  item): 57 programs still carry a leftover uncategorized `10-day`/`summer`/`semester`
  tag that exactly duplicates their typed `durationType` column. Proposed retiring these
  3 tags at Gate 1; **you opted to keep them**, so they remain in place, still redundant
  but harmless. Separately, 7 GAP_YEAR programs are missing the `age-gap-year` tag
  despite having other age tags (`yahel-social-change-fellowship`, `jts-israel-year`,
  `new-israel-fund-shatil-social-justice-fellowship`, `midreshet-rachel-vchaya`,
  `huc-jir-year-in-israel`, `otzma`, `israel-tech-challenge-fellows-program`) — an
  incompleteness gap, not a conflict; not auto-fixed since it wasn't in the pre-approved
  auto-fix scope.
- A name/description-vs-age-tag contradiction sweep found no genuine conflicts beyond
  regex noise (e.g. "post-high-school" false-matching a "high school" signal on
  programs explicitly for post-high-school-age gap-year students).

## Workstream 2 — Taxonomy (Gate 1 — applied, with two modifications you made)

**Duration buckets.** Added `SHORT`, `MULTI_YEAR`, `ONGOING` to the `DurationType`
enum via `prisma migrate dev` (additive-only `ALTER TYPE ADD VALUE` — no Neon branch
cut, per your explicit approval, since no CLI/MCP branch-cutting tool was available in
this environment and the migration can't corrupt existing data). Retired `CUSTOM` from
the filter (kept in the enum — Postgres can't drop enum values in place). Reclassified
all 102 former-`CUSTOM` programs: 42 → `MULTI_YEAR`, 35 → `ONGOING`, 13 → `SEMESTER`
(12 confident + `sam-spiegel-jerusalem-international-film-lab`, added after catching my
own classifier false-positive — see below), 9 → `SHORT`, 2 → `GAP_YEAR`. Spot-checked
the pre-existing 196 GAP_YEAR and 48 SUMMER programs for mislabels and found none —
13 GAP_YEAR entries mentioning "hesder" turned out to be correctly bucketed, since
they're diaspora-facing one-year overseas tracks at otherwise-hesder yeshivot (e.g.
`yeshivat-har-etzion-the-gush`'s "Overseas Students Program"), not the full multi-year
Israeli hesder track. Post-migration distribution: TEN_DAY 4, SHORT 9, SUMMER 48,
SEMESTER 25, GAP_YEAR 198, MULTI_YEAR 42, ONGOING 36, CUSTOM 0.

**Self-caught error**: my first classification pass silently dropped
`sam-spiegel-jerusalem-international-film-lab` from the reclassification table — a
keyword rule matched "four-year" in its description, but that phrase referred to a
*separate* track at the same school, not the Lab program itself. Caught via a
before/after key-count check against the source data before running the migration;
added back as a flagged, tentative `SEMESTER` placement (along with
`vertigo-international-dance-program-vidp`, whose own description never states a
duration) — both worth a human confirmation pass.

**New tags applied**: `#aliyah` (7: `garin-tzabar`, `machon-meir`, `midreshet-harova`,
`ono-academic-college-international-school`, and all 3 Habonim Dror shnat programs),
`#lone-soldier` (2, deliberately narrow — `garin-tzabar` and
`sherut-leumi-national-service-via-nefesh-bnefesh` — a first broader pass caught 21
hesder/mechina programs via "IDF service" language, which would have diluted the tag
past usefulness), `#birthright` (4: `birthright-israel`,
`birthright-israel-excel-fellowship`, `israel-free-spirit`,
`apf-medical-and-nursing-volunteer-program`). `#ulpan` normalized onto 9 previously
untagged Hebrew-immersion programs (14 → 23 total).

**Diaspora-relevance filter — dropped per your instruction.** You said "I don't want
an overseas program hashtag, the israeli track is fine" — the `overseas-program` tag
(47 programs) was left completely untouched: no rename, no new filterable category, no
expansion pass. This piece of the original Gate 1 proposal was fully withdrawn before
any writes touched it.

**Legacy duration tags — kept per your instruction.** Proposed deleting the redundant
`10-day`/`summer`/`semester` tags (57 programs); you opted to keep them instead. No
tag deletions occurred.

**One-org-many-tracks rule** — proposed rule (one entry per distinctly-enrollable
track; shared campuses don't split) presented but not enforced/restructured, per the
original scope ("flag violators, don't restructure yet"). NCSY (11 entries, corrected
from the task's stated 8) and Habonim Dror (4, corrected from 3) both conform. The one
flagged violator: `bnei-david-eli` and `mechinat-bnei-david-eli` are near-duplicate
entries for the same institution — left as-is for your review, not merged.

## Workstream 3 — Priority additions

### Already existed (skipped, no duplicate created)
Tier 1: Birthright Israel, Onward Israel, Garin Tzabar, Sar-El. Tier 2: Career Israel,
Tamid Group, Ulpan Etzion, Aardvark Israel, Kivunim, Young Judaea Year Course. Tier 3:
Reichman University study abroad, Hebrew University's Rothberg International School,
Technion International, TAU International, Israel XP (Bar-Ilan's overseas program).

### Added (7 programs, all verified against official sites, no pricing, neutral voice)
- **Masa Israel Journey** — added as the umbrella grant/matching portal itself
  (`ONGOING`), explicitly distinguished in its description from the individual
  Masa-affiliated tracks already listed separately (`career-israel`,
  `arevim-masa-year-of-service`, `masa-israel-teaching-fellows-mitf`, etc.).
- **Nefesh B'Nefesh** — added as an org-level aliyah-support entry (`ONGOING`),
  distinct from the already-listed `sherut-leumi-national-service-via-nefesh-bnefesh`
  track. Tagged `#aliyah` + `#lone-soldier`.
- **Destination Israel** — added as a Masa-affiliated Tel Aviv internship/volunteer
  organizer (`SEMESTER`), distinguished from the generic `onward-israel` entry even
  though one of its own tracks is branded "Onward TLV."
- **4 English-language MBA programs** at universities already covered by
  undergraduate-only entries: Bar-Ilan University International MBA, Hebrew University
  Business School's StartUp 360 MBA and Med-Tech Innovation MBA (two separately
  enrolled tracks, split per the one-org rule), and Tel Aviv University's Sofaer Global
  MBA. All confirmed via official program pages to be genuinely distinct from the
  existing study-abroad entries (none of which mention an MBA).

### Checked but not added
A standalone English-language BA-degree gap (distinct from the existing study-abroad
entries) was investigated but not found well-documented enough to write an accurate
entry without guessing — omitted per "omit unverifiable details rather than guess."

## Workstream 3/Gate 2 — Birthright trip organizers

Researched all 5 named organizers against their official sites. **Only 3 verified as
currently-active Birthright organizers**:
- **Israel Outdoors** — added (`TEN_DAY`), pluralistic adventure-focused itinerary.
- **Mayanot** — added (`TEN_DAY`), Chabad-affiliated, multiple age-cohort/themed tracks.
- **Sachlav** — added (`TEN_DAY`), unaffiliated, all-inclusive service model.

**2 could not be added as requested:**
- **"Amazing Israel"** — could not find this as a real, currently-accredited Birthright
  organizer despite multiple searches. May be a different/renamed organization, or a
  misremembered name. Flagging for you rather than guessing at a match.
- **Shorashim / Israel with Israelis** — confirmed via their own site
  (israelwithisraelis.com) and secondary sources that they **stopped running Birthright
  trips as of November 2022**, pivoting to other "Tailor Made" trip types. Adding them
  as an active Birthright organizer would have been factually wrong, so this was
  omitted rather than added inaccurately.

Structure used (per your Gate 2 approval): one entry per organizer, tagged
`#birthright` + `#10-day`, alongside the existing `birthright-israel` umbrella entry —
matching the site's pre-existing precedent (`israel-free-spirit`, an
accessible-Birthright variant, already existed as its own standalone entry before this
pass).

## Verification performed

- `npx tsc --noEmit` — clean, no type errors.
- `npm run lint` — clean (one warning from my own scratch audit script, fixed).
- `prisma/audit-tags.ts` — 0 twin name/slug pairs, 0 near-duplicate pairs, 0 dead
  `Region.memberSlugs`.
- Re-queried final state: 372 published programs, 0 remaining `CUSTOM` programs,
  duration distribution and tag counts all matched expected values exactly.
- Every rewritten description was re-read in full (not grepped) for coherence after
  editing, per the verification standard in CLAUDE.md.
- Not done: a live dev-server/browser pass over the new `/programs` filter dropdowns
  and the 10 new program detail pages. Recommend a quick manual spot-check before
  considering this fully closed, particularly the two tentative `SEMESTER`
  classifications (`sam-spiegel-jerusalem-international-film-lab`,
  `vertigo-international-dance-program-vidp`) and the `bnei-david-eli` /
  `mechinat-bnei-david-eli` near-duplicate.

## Open items for you

1. Confirm or correct the two tentative `SEMESTER` duration classifications.
2. Decide what to do about `bnei-david-eli` / `mechinat-bnei-david-eli` (merge, keep
   both, or re-scope one).
3. Essence-tag coverage gaps and the 7 GAP_YEAR-missing-`age-gap-year`-tag programs are
   flagged but unapplied — let me know if you want those actioned.
4. "Amazing Israel" — if you have a specific URL or alternate name in mind, I can
   re-research it.
