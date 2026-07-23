# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Standing rules (the contract — read every session)

### Database writes
- Never write to production without explicit approval in the current session. "Plan first" means no writes, no migrations, no `--commit` until approval is given for that specific change.
- Before any write, classify it and act accordingly:
  - **(a) relation edit** — snapshot affected links to JSON, proceed after approval.
  - **(b) field overwrite** — snapshot prior values to JSON, print row count, proceed after approval.
  - **(c) row delete or schema change** — stop, report, wait. Cut a Neon branch first.
- Never bundle a judgment call into an approved commit. If you decide a value is *wrong* rather than *duplicated*, that is a separate decision — print it and wait.

### Data provenance
- `contactEmail` and `contactEmailSource` are owned exclusively by the contact-verification workflow. Import, seed, and batch-research code never writes them (enforced by `lib/importGuards.ts` — do not remove or bypass).
- Never guess, infer, construct, or pattern-match email addresses, URLs, or any contact data. Observed-on-official-page or null. Null is correct; a plausible guess is a failure.
- Tags: never introduce new tag values, casing variants, or spellings. Propose from the existing set; flag gaps and ask.
- Program descriptions are public-facing. Research caveats, verification notes, and meta-commentary go in `adminNote`, never in `description`.

### Verification
- Verifying your own work means re-reading the result for coherence, not grepping for the absence of a removed string.
- After any bulk change, print expected vs. actual row counts.

### Neon
- List and create branches freely. Never delete a branch or project without written approval naming the branch.

`docs/PRODUCT_SPEC.md` is the product roadmap ("Living document," currently v0.1) —
check it for target-state product direction beyond what's already built. Its own
"Current State" section (§0) is partially stale (it still says "Prisma + SQLite"; the
live stack is Prisma + Postgres/Neon, per this file) — trust CLAUDE.md over §0 for what
actually exists today, and the spec for where things are headed.

`README.md`'s "Stack"/"Project structure"/"Notes" sections are also stale on upload
storage — they describe logos *and* videos as local-disk under `public/uploads/`, which
was true once. The reality has since changed twice: per "Upload storage" below, program
video is now YouTube/Vimeo **embeds** (not uploads at all), and branding images are
static files in `public/brand/`. Trust this file over the README for upload storage
specifics.

The README's "Notes" section is *also* stale on search — it still describes matching
"exact tag (hashtag) filters," which predates both the Fuse.js fuzzy search and the
current dropdown filter bar. See "Browse filters" and "Search ranking" below for what
actually exists today.

## Commands

```bash
npm run dev              # start dev server (Turbopack, http://localhost:3000)
npm run build             # production build
npm run start             # run a production build
npm run lint              # eslint (flat config: eslint-config-next core-web-vitals + typescript)
npx tsc --noEmit          # typecheck — there is no dedicated script for this, use directly
```

**A small Vitest suite exists** (`npm test`, `vitest.config.ts` at the repo root, aliasing
`@` to the repo root same as `tsconfig.json`) — `lib/roles.test.ts` (the
`requireRole`/`requireSignedIn`/`requireSignedInNotBanned` matrix, since keyless local dev
can't exercise a signed-in-non-admin session directly), `lib/folders.test.ts` (an IDOR
lockdown suite for `lib/folders.ts`'s ownership checks, using a hand-rolled in-memory
Prisma fake via `vi.mock("@/lib/prisma")` rather than a real database), `lib/videoEmbed.test.ts`
(pure URL-parsing/canonicalization cases for `parseVideoLink` across all five embed
platforms — no mocks needed, since that module has no DB or network dependency),
`lib/pollShared.test.ts`/`lib/pollFormat.test.ts` (the alumni-ratings question resolver,
skip/consent submission rules, and stars/percent math — see "Alumni ratings" below),
`lib/programFaqShared.test.ts` (the FAQ "Ask a question" schema's consent-literal/length/
honeypot cases — see "Program FAQs and the public poll link" below), and
`lib/homeVideoConfig.test.ts` (the homepage hero video's config schema/parser and
`youtubePosterFromEmbedUrl` — see "Homepage hero video" below). This covers pure-logic `lib/*.ts`
functions behind `vi.mock`-able boundaries (or with no external dependency at all), not
routes, pages, or anything that needs a real Postgres connection — most verification in
this project is still `npx tsc --noEmit`, `npm run lint`, exercising the feature via
`curl`/the running dev server, and (for data changes) querying Neon directly. Follow
`lib/roles.test.ts`'s pattern (hoisted mocks, dynamic `await import(...)` after
`vi.mock`) if adding a DB-adjacent test to this suite rather than introducing a
different testing style.

### Database

Schema lives in `prisma/schema.prisma`; Prisma client is generated to the **non-default**
path `app/generated/prisma` (see the `generator client { output = ... }` block), not
`node_modules/.prisma` — imports look like `@/app/generated/prisma/client`.

```bash
npx prisma migrate dev --name <description>   # create + apply a migration (dev/local)
npx prisma generate                            # regenerate client after schema-only edits
npx prisma db seed                              # runs prisma/seed.ts (sample data)
```

`postinstall` already runs `prisma generate`, and `prisma.config.ts` loads `dotenv/config`
for Prisma CLI commands automatically. **That auto-loading does not extend to plain
`tsx` scripts** — the repo has several one-off data scripts in `prisma/*.ts`
(`import-researched.ts`, `categorize-tags.ts`, `migrate-structured-attrs.ts`,
`apply-facet-tags.ts`, `apply-facet-tags-by-slug.ts`, `apply-good-for.ts`,
`apply-structured-attrs-6.ts`, `seed-mission.ts`) that talk to Prisma directly; running them with bare
`npx tsx prisma/whatever.ts` will fail to connect because `DATABASE_URL` isn't in the
environment. Load it first:

```bash
set -a && source .env && source .env.local && set +a && npx tsx prisma/whatever.ts
```

The `@/*` path alias resolves fine under `tsx` (same `paths` mapping as `tsconfig.json`),
so these scripts can freely `import` from `lib/`.

## Architecture

### This is Next.js 16 — expect unfamiliar conventions
Per `AGENTS.md`: check `node_modules/next/dist/docs/` before assuming App Router
behavior from training data. One concrete trap already hit in this repo: **there is no
`middleware.ts`** — Next 16 renamed the convention to **`proxy.ts`** (see `proxy.ts` at
the repo root, which wraps `clerkMiddleware` and gates `/admin(.*)`). Don't create a
`middleware.ts` expecting it to run.

### Data-access layering
Pages/route handlers generally don't call `prisma` directly for anything nontrivial —
they go through a `lib/*.ts` module scoped to the entity: `lib/programs.ts` (Program
CRUD + search/filter), `lib/references.ts` (alumni references + contact requests),
`lib/programEdits.ts` (edit review/apply), `lib/siteContent.ts`, `lib/clerkUsers.ts`
(batch Clerk profile lookups by id), `lib/programExport.ts` (xlsx export log). New
features should follow the same shape rather than inlining Prisma calls in a route.

**Watch what you pass to client components.** `lib/references.ts`'s
`listPublishedReferences` deliberately `select`s only the fields the public program page
may render — `contactEmail`/`userId`/`whatsappNumber`/`whatsappNumberSource` must never
reach a client component's props, since Next.js serializes client-component props into
the page's RSC payload and they end up in the raw HTML even for fields the JSX never
displays. Follow the same select-only-what's-public pattern for any other model with a
mix of public and sensitive fields (e.g. `ContactRequest`, which carries
`requesterEmail`).

`Reference.whatsappNumber` (+ its required `whatsappNumberSource`, added alongside
`contactEmail` since both are gated identically) is admin-only — never rendered to the
public or to a contact-requester, same as `contactEmail`. It's set either by the
reference-giver themselves at submission time (`lib/phone.ts`'s
`optionalWhatsappNumberSchema` normalizes to E.164; the source is auto-generated as
`"self-submitted via reference form <date>"`, never user input) or by an admin via
`/admin/references` (`lib/references.ts`'s `updateReferenceWhatsapp`, which refuses a
number without a source). No phone-number library is in `package.json` —
`lib/phone.ts`'s `normalizeToE164` is a small hand-rolled E.164 check, not a full
libphonenumber-style parser.

### Moderation: three different shapes for three different risks
`ProgramStatus` (`PENDING`/`PUBLISHED`/`REJECTED`) gates **new** Program and Reference
submissions with a simple whole-record approve/reject (`components/QueueActions.tsx`,
`app/admin/page.tsx`) — these are "does this look legit" gates, not partial edits.

**Proposed edits to an existing Program are different and more granular.** A
`ProgramEdit.payload` is the raw submitted JSON, but moderators never approve it
wholesale — `lib/programEdits.ts` diffs it against the live Program (reusing
`lib/diff.ts`'s word-diff) and seeds one `ProgramEditFieldDecision` row per changed
field (plus synthetic rows for tag adds/removes, keyed `tag:added:<name>` /
`tag:removed:<name>`). The review screen at `app/admin/edits/[id]/page.tsx` lets a
moderator accept, reject, or hand-edit each field independently; only `ACCEPTED` rows'
(possibly moderator-edited) `finalValue`s get merged onto the Program. There is
deliberately no one-click "approve entire edit" path anymore. Every accepted `finalValue`
is a plain string that gets assigned onto the typed `Program` row — nullable enum
columns (currently just `travelType`) need an explicit `"" -> null` coercion in
`applyReviewDecisions`'s `NULLABLE_ENUM_FIELDS` branch, or an empty selection ("Not
specified") throws a Postgres enum-violation on approval. Adding a new nullable
enum/typed column that's edit-reviewable should extend that same branch.

Reviews (`Review` model) are **not moderated at all** — they publish immediately, and
only deletion is moderator-gated. Don't assume all user-generated content follows the
same review pipeline; check which one a given model actually uses.

`Reference` (an alumni's "I attended, here's my experience") reuses the same
`ProgramStatus` whole-record approve/reject as Program. `ContactRequest` (a prospective
participant asking to be put in touch with a reference-giver) is **not moderated at
all**, but it's also not public — `lib/references.ts`'s `markContactRequestReplied`
checks that the caller owns the `Reference` the request is attached to before allowing
a status change, since a reference-giver's real contact info (`Reference.contactEmail`)
is only ever meant to reach that one requester out-of-band, never rendered to anyone
else via the API.

### Roles: `user` / `moderator` / `admin` / `banned`
Stored in Clerk `publicMetadata.role`, read via `lib/roles.ts`. `requireRole`/
`requireSignedIn` are the general gates; `requireSignedInNotBanned` is a narrower one
used by the two "suggestion" routes (new Program creation, proposed edits) and by the
videos route (adding a video renders arbitrary third-party embed HTML on the program
page — more than the ban's original narrow scope was meant to leave open) — banning
intentionally does not block reviews, references, or contact requests.
The ban action itself reuses the existing admin role-update route (`role: "banned"` is
just another value), plus a separate **moderator-accessible** `POST
/api/admin/users/[id]/ban` route — deliberately narrower than the admin-only general
role route, since it can only ever set `"banned"`, never promote someone.

### Contact email: Organization model, provenance, and human verification
`Program.contactEmail` is only ever a program's *own* address. `Organization`
(`id, name @unique, contactEmail, contactEmailSource, programs`) exists
separately for umbrella bodies whose contact is shared across otherwise-
distinct programs (e.g. several Mechinat-* programs all pointing at the
Joint Council of Pre-Military Academies' front desk) — `Program.organizationId`
is set, and `Program.contactEmail` left null, only when a program's *sole*
known contact is that umbrella address; merely sharing a parent brand doesn't
qualify. `Program.contactEmailSource` (nullable URL) records where a
researched email was observed — distinct from `contactEmailVerifiedAt` (see
below), which means "a human confirmed this is live," not "we know where it
came from."

No email is ever considered verified just because it was scraped from an
official site. `lib/emailVerification.ts` implements a human-in-the-loop
verification workflow: `Program.contactEmailStatus`
(`VERIFIED`/`BOUNCED`/`WRONG_CONTACT`, nullable) is the current state, and
`ContactEmailVerification` is an append-only audit log (one row per admin
action, snapshotting the email + status + an optional note) so a bounced
address and the reason it failed survive even after `Program.contactEmail`
is later edited to something else. Admins work the queue at
`/admin/email-verification` (`listEmailVerificationQueue` — every program
with a non-null `contactEmail` whose status is null, or whose `VERIFIED`
status is older than `STALE_AFTER_MONTHS` (18)). Staleness is computed at
query time from that one constant, never stored, so the queue and the public
page's "is this still trustworthy" check can't drift apart. The three
actions (`recordEmailVerification`) run as a single Prisma transaction
behind `POST /api/admin/programs/[id]/email-verification` (admin-gated). A
CSV export (`GET /api/admin/email-verification-queue.csv`) exists for manual
outreach — there is deliberately no send integration, following the
existing `/admin/emails` Gmail-BCC tool's precedent of leaving the actual
sending to the admin's own mail client.

**`contactEmailStatus`/`contactEmailVerifiedAt` are never backfilled and
never proposable content.** Both `updateProgram` (`lib/programs.ts`) and
`applyReviewDecisions` (`lib/programEdits.ts`) reset them to null the moment
`contactEmail`'s value changes (a changed address is unverified by
definition), but neither path — nor the `ProgramEdit` field-decision UI —
ever lets a non-admin or an automated import set them to anything else. The
only write path that can set `VERIFIED`/`BOUNCED`/`WRONG_CONTACT` is an admin
clicking a button in the queue. Public display
(`app/programs/[slug]/page.tsx`) follows a "label, don't hide" rule: a
never-checked or stale-verified email still renders, with a muted "not yet
verified" badge; a fresh `VERIFIED` email renders with a "Verified" badge;
`BOUNCED`/`WRONG_CONTACT` are suppressed from the public page entirely
(known-bad is exactly the case hiding is for), though the address itself
stays on the Program row so an admin can still see/replace it via the
normal edit flow.

### Two unrelated "send email" tools — don't conflate them
`/admin/emails` (plural, `app/admin/emails/page.tsx`) is the older bulk tool referenced
above — it composes a Gmail `mailto:`/BCC link and never sends anything itself. The
**consolidated `/admin/email` section** (singular — `app/admin/email/layout.tsx` gates
admin-only and renders shared tabs via `EmailTabs`) is a different, newer system that
*does* send, through Resend:
- **Outreach** (`/admin/email/outreach`, `lib/outreach.ts`) drafts a "your program is
  listed" email per `Program` into the `OutreachEmail` table (one row per program —
  `@unique programId` — so regenerating upserts in place rather than piling up rows).
  `renderOutreachTemplate` fills a small `{mergeField|"fallback"}` syntax (`{programName}`,
  `{listingUrl}`, `{programDescriptor}` built from `durationType` + `location` via the
  same admin-editable `DurationOption` label map `/admin/tags` uses — never invented
  wording) against either the single global template in `SiteContent`
  (`outreachSubjectTemplate`/`outreachBodyTemplate`) or a named, reusable
  `OutreachTemplate` row. `lib/outreachCategories.ts`'s `categorizeProgram` buckets
  programs missing a draft into admin-requested groups (English yeshivot/seminaries,
  Israeli mechinot, etc.) using `Program.outreachCategory` when an admin has set it,
  else heuristics over tags/duration/name. Drafts require admin approval
  (`approvedAt`/`approvedById`) before `send-batch` will send them, and a hand-edited
  draft (`edited: true`) is never silently regenerated. **Sending is real**: `send-batch`
  calls Resend directly and stores the returned `resendId`; `POST /api/webhooks/resend`
  (signature-verified via `resend.webhooks.verify`, reading the raw request body —
  parsing-then-reserializing would break the signature check) handles the
  `email.bounced` event and calls `markOutreachBouncedByResendId`, which both flips the
  `OutreachEmail` row and — since a bounced outreach send is itself evidence about the
  address — calls the *same* `recordEmailVerification` the manual verification queue
  above uses, tying outreach sending back into `contactEmailStatus`. This is the one
  path in the app where an automated process (not an admin click) can set
  `contactEmailStatus`.
- **Counselors** (`/admin/email/counselors`, `lib/counselorContacts.ts`) is a completely
  separate workflow over the `CounselorContact` model — Israel-guidance counselors at
  Jewish schools *abroad*, not `Program` rows at all (see the model's schema comment).
  Same append-only audit-log shape as `ContactEmailVerification`: `recordCounselorOutreach`
  both updates `CounselorContact.status` and appends a `CounselorContactEvent` row.
  Editing `email` resets `status` to `NOT_CONTACTED`, same "a changed address's history no
  longer applies" rule as `Program.contactEmailStatus`. A CSV export exists
  (`GET /api/admin/counselor-contacts.csv`) but — like the verification queue's CSV —
  there is no send integration; the counselor-outreach *action itself* is manual.
- **Contacts**/**Templates**/**Verification**/**Test** are the remaining tabs:
  raw contact-email harvest results, `OutreachTemplate` CRUD, the
  `/admin/email-verification` queue folded in here, and a one-off test-send page.

### Tags: flat model, optional category, principled split from structured attributes
`Tag` has an optional `category` (`gender` / `affiliation` / `israeli-integration` /
`essence` / `age` / `location` today, plus a dormant, UI-less `language`; most tags —
the general ~140-tag pool — are uncategorized). `population` and the old `affiliation`
set (`orthodox`/`secular`/`pluralistic`/etc.) were retired to `category: null` when the
newer taxonomy replaced them (`prisma/seed-new-taxonomy-tags.ts`) but the tag rows
themselves were kept, not deleted — they're read as the confidence signal by
`prisma/retag-taxonomy.ts`, a historical one-time migration script, not one to re-run.
Multi-select filtering in `lib/programs.ts` groups selected tag slugs by category and
**ORs within a category, ANDs across categories** (e.g. two "location" tags match
either; a "location" tag plus a "gender" tag requires both) — see the category-grouping
helper in `listPrograms`.

Deliberate modeling principle: attributes that are booleans or a small fixed set of
tiers get **real typed `Program` columns**, not tags — `hasScholarship`,
`hasCollegeCredit`, `travelType` (`TravelType` enum) exist specifically because they
used to be tags and that was the wrong shape. If a new attribute is genuinely a
boolean/enum rather than a freeform identity/vibe descriptor, follow that precedent
instead of adding another tag.

**Every write path resolves typed-in tag names through one shared resolver — never
slugify-and-upsert inline.** `lib/tags.ts`'s `resolveTagsByName` (connect) and
`findExistingTagIds` (disconnect) match a name to an existing tag by case-insensitive
name first, then by `slug`, and only create a new tag if neither matches — never
fuzzily. `createProgram`/`updateProgram` (`lib/programs.ts`), the moderated-edit apply
path (`lib/programEdits.ts`), and `prisma/import-researched.ts` all go through this.
This matters because several admin-seeded taxonomy tags have a `slug` that isn't
`slugify(their own name)` (e.g. slug `integration-low`, name "Low integration") — a
bare `prisma.tag.upsert({ where: { slug: slugify(name) }, ... })` on one of these
silently mints a fresh **uncategorized duplicate** instead of reattaching the canonical
tag, and the browse-filter dropdown (which filters on the canonical slug) then misses
every program re-saved that way. This exact bug shipped and was repaired once already
(9 duplicate tags merged, `Region.memberSlugs` fixed to point at live tags) — run
`prisma/audit-tags.ts` (read-only) any time to check for name/slug twin pairs or dead
`Region.memberSlugs` before assuming the data is clean; `prisma/merge-duplicate-tags.ts`
is the hand-reviewed repair template if it recurs.

### Recurring pattern: split a `lib/*.ts` module when a client component needs its types
`lib/prisma.ts` imports the `pg` driver, which needs Node built-ins (`tls`, etc.) that
don't exist in a browser bundle — so any `lib/*.ts` file that (transitively) imports
`lib/prisma.ts` cannot be imported from a `"use client"` component, even just for a type
or a constant. Two instances of the same fix so far: `lib/tagTints.ts` was split out of
`lib/tags.ts`, and `lib/missionBlocks.ts` was split out of `lib/mission.ts` — each split
file holds only the pure types/constants/zod schema a client form component needs
(`MissionBlocksForm.tsx`, tag-tint pickers), while the original file keeps the
Prisma-backed CRUD functions and re-exports the split file's symbols for server-side
callers. Follow this precedent — pull the client-needed pure declarations into a
sibling `*Foo.ts` file — rather than making a "use client" component import the
Prisma-backed module directly.

### Browse filters: one dropdown per category, all config admin-editable via DB tables
`components/SearchBar.tsx` renders one dropdown per filter category via the shared
`components/ui/FilterDropdown.tsx` multi-select popover — Duration, Gender, Religious
affiliation, Participant mix, Age, Essence, Region — instead of a flat pill cloud. All
filter state still lives in the URL (`q`, `tags`, `duration`); there's no client-side
filtering. Selecting anything does `router.push` to a new `/programs?...` URL, which
re-runs the `app/programs/page.tsx` server component and re-queries via `lib/programs.ts`.

Gender / Religious affiliation / Participant mix / Age / Essence dropdowns are driven
directly by `TagCategory` rows (`showInFilter`, `order`, `tint`) and their member `Tag`
rows — a new category shows up with zero code changes (see `lib/tags.ts`'s
`listTagCategories`/`getTagsGroupedByCategory`, managed via `app/admin/tags`'s
`TagCategoryManager`/`TagManager`).

**Duration and Region are *not* `Tag`/`TagCategory` rows** — they're their own
admin-editable tables (`DurationOption`, `Region` in `schema.prisma`), managed via
`app/admin/tags`'s `DurationManager`/`RegionManager` components, with their filter
header label/tint/visibility stored as `SiteContent` keys
(`durationFilterLabel`/`Tint`/`Show`, `regionFilterLabel`/`Tint`/`Show` — see
`app/programs/page.tsx`). Duration is a real `Program` column (`durationType`), not a
tag; `DurationOption` only overrides its display label/order/filter-visibility per
value, with the static `DURATION_LABELS` map (`lib/duration.ts`) as seed default and
fallback. **Region is a pure UI-layer grouping over `location`-category tags, not a new
`Tag.category`** — each `Region` row's `memberSlugs` (a `String[]`, softly referencing
`Tag.slug`, not a foreign key) is a subset of existing location-tag slugs; toggling a
region in the UI just adds/removes all of that region's member slugs from the `tags`
URL param at once, riding the exact same `buildTagAndClauses` OR-within-category logic
as any other location tag (no schema change, no new filter param). `lib/regions.ts`'s
`REGION_TO_SLUGS`/`REGION_LABELS`/`REGION_ORDER` are **only the one-time seed defaults**
for `prisma/seed-duration-region.ts` — at request time `SearchBar` receives the live
`Region`/`DurationOption` rows as props from `app/programs/page.tsx` (via
`listRegions()`/`listDurationOptions()`), never importing those constants directly. A
newly-imported program's location tag won't surface under any region filter until an
admin adds it to that Region's `memberSlugs` (via `RegionManager`) — an empty
`memberSlugs` array is a valid, deliberate state (a region with no members yet), not a bug.

Duration is also multi-select (`DurationType[]`, Prisma `{ in: [...] }`), matching the
other dropdowns — its URL `duration` param is comma-joined like `tags`.

### Search ranking: Postgres filters, then a tokenized-match ∪ Fuse.js union, then a relevance-tier pass
`lib/programs.ts`'s `listPrograms` runs every structured filter (`status`, tag AND/OR
clauses, `durationType`, `hasScholarship`, `hasCollegeCredit`, `travelType`) as one
Postgres query, then — only if a free-text `q` term is present — ranks that
already-filtered set in memory. At the current program count this in-memory pass is
effectively free and avoids a `pg_trgm`/`tsvector` migration; `docs/PRODUCT_SPEC.md` §9
describes that as the eventual V2 direction, not something built yet.

**Candidate selection is a union of two independent passes, not Fuse alone.** Fuse.js
bitap-matches the *entire* query string as one pattern per field (`SEARCH_KEYS`:
name/organization/tags weighted highest, location/goodFor/description weighted low,
`threshold: 0.35`) — it never splits a multi-word query into tokens. That means a
program whose *tags collectively* cover every query word (e.g. `yeshiva` + `gap-year` +
`modern-orthodox` as three separate tags, no single field containing the whole phrase)
was silently dropped by Fuse alone, even though every word genuinely matched somewhere —
this was a real, reported bug (Yeshivat Hakotel not appearing for tag-spanning queries).
`tokenize()` splits the query into words and `matchesAllTokens()` requires each token to
substring-match *some* field (not necessarily the same one); the candidate set returned
to `relevanceTier` is `Fuse's fuzzy matches ∪ matchesAllTokens matches`, so typo tolerance
(Fuse) and multi-field-word coverage (tokens) both contribute recall.

Neither pass guarantees "closest match first" on its own. `relevanceTier` layers a
deterministic, token-aware tier on top of the unioned candidate set (0 = exact name/tag,
1 = name/org prefix or every token word-boundary in name, 2 = every token covered across
name/org/tags, 3 = every token covered anywhere including description/location/goodFor,
4 = fuzzy-only/typo), and results are sorted by `(tier, then Fuse score, then name)` — a
literal or token-complete match always surfaces above a fuzzy-only one, while Fuse's
score still breaks ties within a tier. Both `app/programs/page.tsx` and the JSON API
(`app/api/programs/route.ts`) go through this same `listPrograms`, so they always rank
identically.

### Upload storage: video is YouTube/Vimeo embeds; branding is static `/public` files; program logos are on Vercel Blob
This changed materially in July 2026, then again on **2026-07-23**. Historically the
project's Vercel **Blob store was suspended** — the Hobby plan's ~10 GB/month
data-transfer cap was blown by serving program video mp4s directly, so *every* blob URL
(videos **and** the brand images that used to live there) returned `403 "Your store is
blocked"` for anyone without a warm browser cache (which is why a bug from that era could
look like it only affected signed-out visitors — a signed-in dev's disk cache masked it).
That is why video moved to embeds and branding moved to static `/public/brand/` files
(both below). **As of 2026-07-23 a fresh, working Blob store is connected**
(`BLOB_READ_WRITE_TOKEN` in `.env.local` and Vercel env), and **program logos are now
uploaded to it** (see the Program logos bullet below). Video and branding were **not**
moved back — they remain embeds and static files respectively; don't reintroduce
Blob-backed *video* uploads.

- **Video is now embeds, not file uploads — five platforms, not two.**
  `components/VideoUploader.tsx` takes a pasted link from YouTube, Vimeo, Facebook,
  Instagram, or TikTok. `app/api/programs/[id]/videos/route.ts` zod-validates the body
  (same http(s)-only discipline as `lib/programs.ts`'s `httpUrl`) then runs the URL
  through `lib/videoEmbed.ts`'s `parseVideoLink` (accepts each platform's common
  watch/share/embed link shapes, canonicalizes server-side to a safe per-platform embed
  URL built from a template using only the extracted ID — never the raw pasted string —
  and **rejects anything else**) or, for `fb.watch`/`vm.tiktok.com`/`tiktok.com/t/...`
  short links, `resolveShortVideoLink` (follows one redirect hop against a fixed host
  allowlist, then re-parses the destination) and stores the canonical URL with
  `mimeType: "embed/<provider>"`. The route requires `requireSignedInNotBanned()` (not
  the bare `requireSignedIn()` other user-generated content uses) — see the comment on
  `requireSignedInNotBanned` in `lib/roles.ts` for why videos specifically got carved out
  of the ban's narrow scope. No platform needs an App ID, API key, or SDK script for the
  iframe approach used here (verified live July 2026) — Facebook's `plugins/video.php`,
  Instagram's `/embed/captioned/`, and TikTok's `/player/v1/` all render unauthenticated
  for public videos; each just needs a `frame-src` CSP entry (see below).
  `components/VideoList.tsx`'s `VideoPlayer` branches on `platformForStoredUrl(url)`
  (matched on the canonical hostname, **not** the client-influenced stored mimeType):
  YouTube/Vimeo render an immediate sandboxed 16:9 `<iframe>` (lightweight, no SDK);
  Facebook/Instagram/TikTok render a click-to-load facade first (those embed documents
  are heavy — Instagram's is ~600KB — and a program page can list several) before
  mounting the same sandboxed iframe; TikTok/Instagram use a 9:16 frame instead of 16:9.
  Every iframe gets an explicit `sandbox` attribute and `allow` list — never a bare
  iframe. Anything that isn't a recognized embed host and isn't a legacy Blob URL renders
  a plain "Watch on [Platform]" link-out instead of a broken iframe. Legacy Blob file URLs
  keep the `<video>` element and its CDN-propagation retry. The old browser-direct-Blob
  path (`app/api/videos/upload/route.ts` + `@vercel/blob/client`'s `upload()`, gated by
  `requireSignedIn`) still exists and the record route still accepts
  `*.public.blob.vercel-storage.com` URLs, so pre-existing rows keep working — but the
  uploader UI no longer offers file upload, and you shouldn't add it back. The homepage
  featured card (`components/FeaturedProgramCard.tsx`) renders through the same
  `VideoPlayer`, so embeds work there identically — no separate video path exists.
- **Branding images are static files in `public/brand/`.** Header logo, home/emblem
  logos, and background watermarks (each with a light + dark variant) are referenced by
  `SiteContent` keys — `headerLogoUrl`, `homeLogoUrl`/`homeLogoUrlDark`,
  `emblemLogoUrl`/`emblemLogoUrlDark`, `backgroundLogoUrl`/`backgroundLogoUrlDark` —
  whose bodies are `/brand/*.png` paths served by Vercel's static CDN, not Blob. None of
  these PNGs has a transparent background, so each variant is the file whose baked-in
  background matches its surface (navy header `#1a2740`, cream light page `#fbf8f2`,
  near-black dark page `#14110b`); public display follows a "clean fallback, never a
  broken icon" rule — a blank key renders text/light-mode fallback, not a 404 `<img>`.
  The admin "upload logo" form (`components/SiteLogoForm.tsx` →
  `app/api/site-logo/upload/route.ts`) uploads branding to Blob via `handleUpload`; with
  the working store (above) that path should function again, but the deliberate
  convention is still to set branding by committing a file to `public/brand/` and
  pointing the SiteContent key at it (static CDN, no per-request Blob transfer), not via
  the admin upload UI. (Program *logos* are a separate surface — see the next bullet.)
- **Program logos are uploaded to Vercel Blob** (as of 2026-07-23). `lib/storage.ts`'s
  `saveLogo` uploads via `@vercel/blob`'s `put()` (`access: 'public'`,
  `addRandomSuffix: true`), validating MIME (png/jpeg/webp — no SVG) and a 5 MB cap and
  throwing `UploadError` on a bad file; the returned public URL is stored in
  `Program.logoUrl` and rendered via `next/image` (`ProgramCard`, program detail page).
  The Blob host (`*.public.blob.vercel-storage.com`) is allowlisted in **both**
  `next.config.ts`'s `images.remotePatterns` **and** its CSP `img-src` — both are
  required, or a logo either 500s (next/image) or is blocked (CSP). The create/edit
  routes (`app/api/programs{,/[id]}/route.ts`) treat a non-`UploadError` Blob failure as
  non-fatal: the program is saved/edited without the logo and the response carries a
  `warning`. This replaced the old local-disk `writeFile`, which threw `EROFS` on the
  read-only serverless FS and was the root cause of "Failed to create program" for any
  submission with a logo attached. `scripts/clear-blob-store.ts` (dry-run-by-default
  audit + targeted delete) and `scripts/audit-program-logos.ts` (read-only) support this.
- **Shared-DB gotcha when repointing branding or featured videos:** `SiteContent` (and
  all data) lives in **one** Neon database shared by local dev and production, so editing
  a key locally takes effect on prod *instantly* — but a `/brand/*.png` file it points at
  only exists on prod after a commit + deploy. Change the key and deploy the file
  together, or prod serves a broken image in the window between.

### The xlsx export is DB-backed, not file-based — and that's deliberate
`lib/programExport.ts` does **not** write a file to disk. It was originally
implemented that way and broke in production for the same filesystem reasons as
logo uploads above; it now maintains `ProgramExportRow` — an immutable, append-only log
table with no FK to `Program` (so a row survives even if its program is later renamed
or deleted) — and generates the `.xlsx` fresh in memory, on demand, at download time
(`app/api/admin/programs-xlsx/route.ts`). `instrumentation.ts`'s `register()` runs a
reconciliation sweep on every server boot to catch any Program row created outside the
normal `createProgram()` path (direct DB inserts, scripts); since the reconciled state
lives in Neon rather than local disk, this works identically on a Vercel cold start or
local `next dev`. If you're tempted to write a file for some other feature, this is
the cautionary precedent — prefer DB-backed or object-storage-backed state instead.

### Saved lists (`Folder`/`FolderItem`): the one-tap save is a lazily-created default folder
`/saved` (list) and `/saved/[id]` (detail) are user-owned collections, all access-checked
through `lib/folders.ts` (`getFolder`/etc. verify `ownerId` matches the caller —
`folders.test.ts` is the IDOR regression suite for exactly this). There's no flat
favorites/bookmark table: a plain "save this program" tap calls `saveToDefaultFolder`,
which lazily creates a folder with `isDefault: true` on first use rather than requiring
the user to name one up front. Per-user caps (`MAX_FOLDERS_PER_USER = 50`,
`MAX_ITEMS_PER_FOLDER = 200` in `lib/folders.ts`) are enforced in these functions, not the
schema. Sharing (`mintShareToken`) always generates a **fresh** random token rather than
toggling a reuse flag — `revokeShareToken` nulls it out, and a revoked link can never
come back to life by re-sharing, deliberately. The public, unauthenticated read view for
a shared link is `app/s/[token]/page.tsx` (`getSharedFolder`) — `noindex` but not
`robots.txt`-disallowed, specifically so link-preview scrapers (WhatsApp/Facebook) can
still fetch it to build a share card while search engines don't index it. Per
`FolderItem`'s schema comment: `programId` uses `onDelete: SetNull`, not `Cascade` — a
hard-deleted program leaves a tombstone row (`programId: null`) rather than vanishing, so
"N programs no longer available" counts stay accurate for both hard-deleted and
merely-unpublished programs; tombstones don't count against `MAX_ITEMS_PER_FOLDER` and
persist until the owner runs `clearUnavailableItems`.

### Program comparison is client-side state, not a URL or DB concept
`CompareProvider` (`components/CompareContext.tsx`) holds up to `MAX_COMPARE` (3,
`lib/compare.ts`) selected programs in plain React state — there's no query param or
persisted "compare list," so a refresh clears the selection. `CompareCheckbox`/
`CompareAddControl` toggle membership from program cards, `CompareBar` is the
floating summary, and `app/compare/page.tsx` renders the side-by-side table by
re-fetching the selected slugs server-side (`getProgramsBySlugs` in `lib/programs.ts`)
rather than trusting client-held program data. `lib/facets.ts`'s `TRAVEL_TYPE_LABELS`
(a display-label map for the `TravelType` enum, same idea as `DURATION_LABELS`) backs
both this table and other travel-type displays.

### Leads, analytics, and the contact form: anonymous, no-cookie, best-effort
Three related surfaces added together (`lib/leads.ts`, `lib/analytics.ts`, `lib/email.ts`,
`lib/rateLimit.ts`), all sharing a deliberate "never block or identify the user" posture:

- **Analytics** (`lib/analytics.ts`) writes one `AnalyticsEvent` row per search / filter
  use via Next's `after()` — fire-and-forget *after* the response streams, with failures
  logged and swallowed so a page render never waits on or fails from an analytics write.
  No user identifier or cookie is ever recorded. `getAnalyticsSummary` aggregates in JS
  over an indexed `findMany` (Prisma can't `GROUP BY` JSON sub-fields, and volume is low);
  the return type is the contract, so swap to `$queryRaw` internally later if needed.
  Admin views at `/admin/analytics`.
- **Leads** (`lib/leads.ts`) are footer "ask us" submissions — `leadSchema` includes a
  honeypot `website` field (real users never fill it). Admin views at `/admin/leads`.
- **Email** (`lib/email.ts`, Resend) **never throws** — a missing `RESEND_API_KEY` /
  `CONTACT_EMAIL` or a Resend failure all resolve to `false`, and the caller falls back
  to a `mailto:` link. There is deliberately no hard dependency on email delivery.
- **Rate limiting** (`lib/rateLimit.ts`) is an in-memory per-instance sliding window
  (per-serverless-instance on Vercel, so best-effort spam friction, not a global
  guarantee); no IP is ever persisted. Both admin pages gate with `getCurrentRole()` and
  **redirect** non-admins rather than throw.

Both the `Lead` and `AnalyticsEvent` tables were added in migrations that shipped in
`df4fbb7` and applied to production separately — if either admin page 500s, check
`prisma migrate status` against the live DB before anything else.

### AI layer: one live surface, a two-stage design that can't fabricate a program
`lib/ai/` defines an `AIProvider` interface with a `NullProvider` (default, deterministic
fallback) and `AnthropicProvider`, switched by `isAIEnabled()` (`AI_ENABLED=true` +
`ANTHROPIC_API_KEY` in env). It backs exactly one route, `POST /api/assistant`
(`app/api/assistant/route.ts`) — a conversational program-recommendation endpoint gated
behind the `assistantEnabled` `SiteContent` flag (admins can always reach it regardless of
the flag, for testing before enabling it publicly; the check is re-verified server-side,
not just used to hide the widget). Deliberately **two-stage**, so the model can only ever
recommend a program that's actually live right now: stage 1 runs the identical
`listPrograms({ q: message })` query `/programs` itself uses (a live DB read, never a
snapshot or embedding index) to produce a bounded candidate list; stage 2 hands only
those candidates to `getAIProvider().recommendPrograms(...)`, which picks among/explains
them but cannot introduce a slug that wasn't in the candidate set. The route re-validates
the returned slugs against its own candidate map before responding — defense in depth
independent of trusting the provider's structured-output guarantees. Also rate-limited
tighter than the leads/analytics endpoints (`lib/rateLimit.ts`, 20 req / 10 min per IP),
since an enabled assistant calls a paid external API per request.

### Adding real programs: a two-phase research → enrichment pipeline, not one script
New programs don't get created by hand one at a time. `data/researched-programs*.json`
files (batch 1, 2, 3, …) hold raw web-researched program data — each keyed by category,
with a top-level `_note` documenting what that batch covered, what's still TODO, and any
known cross-batch duplicates. `prisma/import-researched.ts <filename>` imports one of
these files, deriving each `Program.slug` from `slugify(name)` and skipping rows whose
slug already exists — **but this only catches exact-slug repeats**, not the same real
program re-researched under a differently-worded name (e.g. "Ben-Gurion University —
Ginsburg-Ingerman OSP" vs. the already-imported "Ginsburg-Ingerman Overseas Student
Program (OSP)"); a new batch needs a description-level duplicate check against prior
batches before import, not just a slug check.

Import creates each row with **`status: "PUBLISHED"` immediately** — there is no
moderation gate on research-imported programs the way there is on user-submitted ones
(see "Moderation" above). A batch is live on the public site the moment
`import-researched.ts` runs against it, before any enrichment pass; don't assume an
imported program is somehow reviewed or pending just because it came from a script.

Import only populates the raw fields (`name`, `description`, `cost`, `tags`, etc.) —
`goodFor`, `hasScholarship`, `hasCollegeCredit`, and `travelType` are a **second pass**,
applied after the fact: `data/good-for.json` (`{slug, confidence, goodFor}` rows) via
`prisma/apply-good-for.ts <filename>` (filename arg is optional, defaults to
`good-for.json`), and `data/facet-tags.json` (`{id, name, add_tags}` rows, keyed by the
*Program's DB id* since it's generated post-import) via `prisma/apply-facet-tags.ts`.
`prisma/categorize-tags.ts` and `prisma/migrate-structured-attrs.ts` were the one-time
migrations that first split gender/affiliation/population into `Tag.category` and
promoted scholarship/credit/travel out of tags into typed columns (see "Tags: flat
model..." above) — they're historical record of *why* the current shape looks the way
it does, not scripts you need to re-run.

Batches researched before import (3, 4, …) can't know a `Program.id` yet, so their
facet-tag files are named `facet-tags-N-by-slug.json` and shaped `{slug, name,
add_tags}` instead. `prisma/apply-facet-tags-by-slug.ts <filename>` handles these —
it resolves each row's slug to a `Program.id` at apply time rather than requiring a
separate manual resolution pass; a slug with no matching program (e.g. one deliberately
excluded from import) is logged and skipped, not an error. The original
`apply-facet-tags.ts` still only reads `data/facet-tags.json` and matches by `id` — it
cannot be pointed at a by-slug file.

When a batch's research already pins down `hasScholarship`/`hasCollegeCredit`/
`travelType` with confidence (rather than needing a separate enrichment pass), the
precedent — see `prisma/apply-structured-attrs-6.ts` — is a small one-off script that
hardcodes `slug -> value` lists and applies them with `prisma.program.updateMany`
directly, bypassing the `good-for`/`facet-tags` files entirely. This is a legitimate
per-batch exception, not a replacement for the general pipeline; don't expect a future
batch's structured attributes to always show up via `apply-good-for.ts`/
`apply-facet-tags-by-slug.ts` — check for a batch-specific `apply-structured-attrs-N.ts`
too. `prisma/migrate-structured-attrs.ts` (the *original* one-time migration that first
promoted these out of tags into typed columns) is unrelated and still not something to
re-run.

`data/batch3-consolidated.json`, `batch4-consolidated.json`, and
`batch5-consolidated.json` are **not** pipeline inputs — they're flat-array intermediate
artifacts from the research-consolidation process (a different shape than the
`{_note, <category>: [...]}` dict `import-researched.ts` expects) and no script reads
them. Don't assume they're live data just because they live in `data/` alongside the
files that are.

**Slug mismatches are a real, recurring failure mode, not a hypothetical one.** The
canonical slug always comes from the `slugify` npm package (`lower: true, strict: true`)
inside `import-researched.ts` itself — never hand-approximate it (e.g. with a quick
regex in a one-off Python script) when pre-computing slugs for a `good-for-N.json` or
`facet-tags-N-by-slug.json` file before import. Confirmed divergences: accented Latin
letters (`é`) get transliterated to their ASCII equivalent (`e`), not stripped; a `/`
between words with no surrounding whitespace (`"Year/Semester"`) is deleted outright
rather than replaced with a `-`. Both silently produce a slug that matches zero programs
— `apply-good-for.ts`/`apply-facet-tags-by-slug.ts` log it as "not found" rather than
erroring, so it's easy to miss unless you diff intended vs. actual slugs after import.

### Alumni ratings (`/rate`, `/admin/polls/*`): ships dark, skippable questions, consent-gated reviews
A 1-5 rating system, system-wide scale, no free-text *ratings* (see `PollReview` below
for freeform *reviews*, which are a separate, optional layer) — seven models
(`PollQuestion`, `QuestionBucket`, `ProgramPollConfig`, `PollResponse`, `PollAnswer`,
`ReferrerToken`, `PollReview`) across two migrations. `20260717122617_add_alumni_polls`
hand-appends a `CHECK ("value" BETWEEN 1 AND 5)` constraint on `PollAnswer` and two
partial unique indexes (`PollResponse` one-counted-per-user-per-program, and
one-counted-and-verified-per-email-per-program — the latter is now dormant, see below);
`20260717145712_add_poll_reviews_and_skip_snapshot` adds `PollReview` (with its own
hand-appended `CHECK ("consentGiven")`) and `PollResponse.presentedQuestionIds`. Prisma
has no first-class syntax for CHECK constraints or partial indexes — **never run
`prisma db push` against this schema**, it silently drops all three.

**Public math counts every response where `status = COUNTED` — `verified` is
deliberately NOT part of the gate.** When the anonymous path's after-submit email
verification was removed (see that bullet below), anonymous link responses started
landing `COUNTED` on submit with `verified` left `false` forever; every aggregate query
in `lib/pollResults.ts` (`getProgramPollSummary`, `listPublicReviews`) and the review
approval gate in `lib/pollReviews.ts`'s `approvePollReview` filter on `status` alone. ⚠️
**Do not "restore" a `verified = true` filter** — `verified` is never true on the
anonymous path at all, so that would silently drop every counted anonymous response
from every score and hide their reviews. The
`PollResponse_email_programId_counted_verified_key` partial index above is a leftover
from when `verified` still gated counting; it's now effectively unreachable (anonymous
responses are never `verified`, signed-in responses never carry an `email`) but kept
rather than dropped — dropping a partial index on the shared/prod DB is a
destructive-schema-change decision, not a doc fix.

**Every question is skippable, and a skip is the *absence* of a row — never a stored
null or sentinel.** Inputs start unanswered (no pre-fill): tapping a value selects it,
tapping the same value again clears it. An **N/A checkbox** beside every question
(`components/polls/QuestionInput.tsx`) is the *explicit, deliberate* version of that
same absence — checking it clears any selected value, disables the inputs until
unchecked, and adds the question's id to `PollResponse.naQuestionIds` (a second
`String[]`, additive migration `20260719181645_add_poll_na_question_ids`) instead of
writing a `PollAnswer` row, same as an ordinary skip. The two are tracked as genuinely
different states, not just different labels for the same `value === null`: an N/A'd
question is a positive, recorded signal ("doesn't apply to me"), while a merely-untouched
question carries no signal at all — `naQuestionIds` is what lets `/admin/polls/moderation`
tell them apart (see below), and an all-N/A submission with no real answers and no
reviews still fails the empty-submission rule the same way an all-skipped one does (N/A
marks aren't "content" any more than silence is). `PollResponse.presentedQuestionIds`
snapshots exactly which question ids the form displayed at submit time (stamped
server-side from the resolved config, never client input) — `/admin/polls/moderation`
diffs this against `answers` and `naQuestionIds` to show "N/A: <question>" and
"Skipped: <question>" as distinct explicit states, and stays accurate even after a
later admin edit changes the program's live question set. Because a response can now
skip `overall`, **the publish gate, headline, and progress bar all read the count of
COUNTED responses that *answered* `overall`, not the count of COUNTED
responses** — see `lib/pollResults.ts`'s `getProgramPollSummary`; a program whose config
has removed `overall` entirely reads 0 here and never leaves "be_first." Per-question
means/counts in that same file are already computed from actual `PollAnswer` rows only,
so N/A (like any skip) naturally excludes itself with no separate aggregate-math change.

Two independent submission paths, both ending at the same `PollAnswer`/`PollReview` rows:
- **Signed-in** (`lib/pollResponses.ts`'s `submitSignedInResponse`): verified + COUNTED
  immediately, no email step ever. A repeat visit updates the existing counted response
  in place (delete-and-recreate its answers in one transaction — reviews are insert-only,
  see below) rather than rejecting the resubmit or creating a duplicate; the partial
  unique index is the DB-level backstop against a concurrent double-submit race, which
  the function retries once against.
- **Anonymous link path** (`/rate/[slug]?ref=TOKEN`, minted at `/admin/polls/links` via
  `lib/pollTokens.ts`'s `mintReferrerToken`): no login wall, submit counts immediately —
  `lib/pollResponses.ts`'s `submitAnonymousResponse` creates the response `COUNTED`
  right away (`verified` stays `false` permanently; nothing ever flips it) unless a
  submit-time anti-abuse check trips, in which case it lands `FLAGGED` instead. This
  replaced an earlier design where an anonymous submit landed `PENDING`/unverified and
  only counted after clicking a magic link from an optional post-submit email step —
  that step caused too much drop-off (real completions sat PENDING forever because the
  follow-up click never happened) and has been **removed entirely**: there is no
  `/rate/verify` route, `verifyPollResponse`, or `sendPollVerifyEmail` in the codebase
  anymore, and nothing reads or writes toward that flow. A **revoked, expired, or
  over-cap token is still accepted, not rejected** — `validateReferrerToken` returns it
  with a flag (`token_revoked`/`token_expired`/`token_over_cap`) instead of an error, so
  a link an admin handed out never silently stops working; only a token that doesn't
  resolve at all falls back to a sign-in CTA. `flags` (`String[]` on `PollResponse`,
  constants in `lib/pollShared.ts`'s `POLL_FLAGS`) also catches `repeat_ip` (a
  salted-SHA-256 `ipHash` — see `lib/pollIntegrity.ts`'s `hashIp`, a deliberate
  departure from `lib/rateLimit.ts`'s "no IP ever persisted" posture) and
  `repeat_browser` (an httpOnly `poll_v_<programId>` cookie, set only on a clean
  `COUNTED` submit). Any of these route the response to `FLAGGED` rather than
  `COUNTED`; an admin can approve it later (`lib/pollResponses.ts`'s
  `approvePollResponse`) once satisfied it's legitimate. `duplicate_email` is a
  **historical, dormant** flag constant — it was set by the removed magic-link
  verification step and past rows may still carry it (the moderation UI still labels
  it), but nothing in the current anonymous-submit path checks or writes it; the email
  optionally collected on this path today is unverified and not deduped against.

**Reviews are optional per-question free text, gated on one submission-level consent
checkbox.** Each question carries its own review textarea (placeholder text states the
comment may be published publicly after moderation); a single consent checkbox sits once,
at the bottom of the form/section, directly above the submit button — not per question.
It gates written comments only, never the rating/N/A: `components/polls/RateForm.tsx`'s
`buildSubmission` detects whether any comment text is non-empty (`hasComments`)
independent of consent, and the submit handler blocks (inline message at the checkbox,
typed text preserved) only when there's a non-empty comment and the box is unchecked — a
submission with no comments never requires checking it. When checked, `consentGiven` is
applied to every comment in that submission, each still landing as its own `PollReview`
row with `consentGiven: true` and its own `consentAt` timestamp (never persisted as
`consentGiven: false`). Consent is enforced three times over: the client only includes a
comment in `reviews` when the box was checked, `lib/pollShared.ts`'s `reviewInputSchema`
requires `consent: z.literal(true)`, and the DB has the hand-written `CHECK
("consentGiven")` above — a non-consented row cannot exist even via a bug. Reviews insert
one at a time after the answer transaction
commits (`lib/pollResponses.ts`'s `insertReviews`), not via `createMany`, so a duplicate
`(responseId, questionId)` — e.g. a signed-in resubmit re-reviewing the same question,
or a retried "add more detail" call — fails only that one review (reported back as
`skippedReviewQuestionIds`), never the whole submission. Every `PollReview` defaults to
PENDING and **nothing auto-approves, ever**: `lib/pollReviews.ts`'s `approvePollReview`
refuses unless the parent response is already `COUNTED` (`verified` is not checked —
see the public-math invariant above). Rejected reviews are retained, never deleted.

**Publishing a review is a query-time join, not a stored flag.** `lib/pollResults.ts`'s
`listPublicReviews` selects `status = APPROVED AND response.status = COUNTED` (again,
`verified` isn't part of the gate — see the public-math invariant above) — voiding a
response hides its approved reviews immediately with zero writes to `PollReview`, and
restoring the response republishes them automatically. Reviews render on the program
page via the unified `components/ReviewsSection.tsx` (poll reviews and standalone
written reviews together, below the summary strip) grouped by question in the
program's live resolved-question order, gated on the kill switch and `resultsVisible`
**only** — deliberately not the score's `minResponsesToPublish` threshold, since every
review was individually approved.

`/admin/polls/reviews` is the moderation queue (default PENDING; approve, reject with
an optional note, bulk-reject) with three attention signals recomputed live on every
page load rather than trusted from stale submission-time flags
(`lib/pollReviews.ts`'s `computeAttentionFlags`): `shared_ip` (>1 non-voided response on
the same program shares this ipHash, computed symmetrically — unlike
`PollResponse.flags`' `repeat_ip`, which only marks the *second* submitter),
`token_over_cap` (the parent's referrer token is *currently* at/over its cap, not
whatever it was at submission time), and `email_domain_matches_program` (the response's
email domain matches `Program.contactEmail`'s domain — never `Organization.contactEmail`,
which is shared across programs and would false-positive on every one of them). A
pending-count badge surfaces on both the Reviews tab and the main `/admin` "Ratings"
nav link.

**Question resolution is one pure function, never duplicated.** `lib/pollShared.ts`'s
`resolvePollQuestionSet` takes a program's config + every bucket + every question and
returns the ordered set the rating form renders: the Core bucket's questions (always
present, minus per-program `removedQuestionIds`, plus per-program `addedQuestionIds`)
first, then extra buckets in the config's `bucketIds` order. Retired questions/buckets
and dead soft-ref ids are silently dropped — same "soft ref rot" tolerance as
`Region.memberSlugs` above, not a foreign key. **The Core bucket is never stored in any
`ProgramPollConfig.bucketIds`** — it's implicit for every program — which is how "the
Core bucket cannot be removed from any program" holds at both the admin UI (no control
ever offers it) and the API layer (`upsertProgramPollConfig` in `lib/pollConfig.ts`
defensively strips the Core bucket's id from `bucketIds` even so). `lib/pollConfig.ts`'s
`getQuestionsForProgram` is the only place that calls the resolver with live data.

**Buckets can also attach automatically, via admin-editable `BucketAttachmentRule` rows
(`lib/pollBucketRules.ts`, `/admin/polls/buckets`'s `BucketRuleManager.tsx`) — additive
to Core and manual attachment, never a replacement for either.** Each rule pairs one
bucket with two-or-more tag slugs (`bucketRuleInputSchema` enforces `.min(2)`, ANDed —
`lib/pollShared.ts`'s `ruleMatchesTags`); a program gets the bucket only when it carries
every one of the rule's tags. `getQuestionsForProgram` composes a program's manual
`bucketIds` with every ACTIVE rule's bucket ids that match the program's current tags
(`getRuleAttachedBucketIds`, ordered by the bucket's own `order`) via
`mergeRuleAttachedBucketIds` — manual attachments first, rule-attached ones deduped in
after — **before** calling `resolvePollQuestionSet`, so a per-program
`removedQuestionIds` still empties a rule-attached bucket's questions exactly like it
would a manually-attached one, with zero special-casing in the resolver itself. Same
retire-never-delete posture as buckets/questions: there is no delete path for a rule,
only `status: RETIRED`, so responses already collected against a bucket a program used
to auto-qualify for are never touched — only future question sets stop including it.
Creating or editing a rule requires seeing `previewBucketRule`'s "how many programs will
this newly affect" count first (`POST /api/admin/polls/bucket-rules/preview`,
`excludeRuleId` when editing so the count is relative to the rule's own prior state) —
`BucketRuleManager.tsx` disables Save until a preview matching the exact current
bucket+tags selection has loaded, so a rule can never silently change dozens of
programs' polls in one save.

Ten `lib/*.ts` modules split by responsibility: `pollShared.ts` (client-safe
types/zod/resolver/rule-matching — no Prisma import, same split-for-client-components
precedent as `lib/tagTints.ts` above), `pollFormat.ts` (client-safe
`meanToPercent`/`formatStarsMean` — percent and stars are **always** derived from the
same mean, never stored or computed independently), `pollIntegrity.ts` (`hashIp`),
`pollConfig.ts` (per-program config + question resolution, now including rule
composition), `pollQuestions.ts` (question/bucket admin CRUD, retire-never-delete once
answered, version-bumps a question's `version` when its `text` changes and it already
has answers), `pollBucketRules.ts` (`BucketAttachmentRule` CRUD — no delete — matching,
and the affected-programs preview), `pollTokens.ts` (`ReferrerToken` mint/validate),
`pollResponses.ts` (submission, magic-link verification, and response moderation:
`voidPollResponse` retains the row; `restorePollResponse` "recomputes" status from the
`verified` flag already on the row rather than needing a separate prior-status field,
reporting a conflict — not throwing — if that collides with a partial unique index),
`pollReviews.ts` (the review moderation queue and its attention flags), and
`pollResults.ts` (React-`cache()`d `getProgramPollSummary` + `listPublicReviews`/
`getProgramReviewsSummary`, only aggregating per-question means/histogram when the
state is actually "published," since the common "ships dark" case needs just a count).

The program page renders `PollSummaryStrip` (between the description and "Who it's
for" blocks) then `ReviewsSection` below it. The strip's four states — be first /
collecting (with a live progress bar) / under review / the published score — are gated
on `resultsVisible` (per-program, `/admin/polls/programs`) AND overall-answer-count
`>= minResponsesToPublish` AND a global kill switch (`SiteContent` key
`pollResultsKillSwitch`, `lib/pollResults.ts`'s `POLL_KILL_SWITCH_KEY`, toggled at
`/admin/polls/moderation`) being off. `/admin/polls/programs` also has a bulk-assign
tool — attach/detach one bucket across every program carrying any of a set of tags in
one action, resolving program ids via the same `tags.some.slug.in` shape
`lib/programs.ts`'s tag filtering uses.

`POLL_IP_SALT` must be set in production. `hashIp` falls back to a hardcoded dev-only
salt when `NODE_ENV !== "production"`, but **throws** if it's unset and `NODE_ENV ===
"production"` — an unset salt in prod 500s every anonymous submission outright, it
doesn't just weaken the hash.

### Program FAQs and the public poll link: two small additions riding the ratings system's patterns
Two features layered onto Alumni ratings above, both reusing its provenance/moderation
conventions rather than inventing new ones.

**`ProgramFAQ`** is one model holding both curated (admin-authored) and visitor-submitted
entries — not two separate tables — distinguished by `source` (`"visitor"` vs.
`"staff"`/`"admin"`/free text) and `status` (`DRAFT`/`PUBLISHED`/`REJECTED`, the third
added beyond a simpler two-state design specifically so a spam visitor question can be
retained-and-rejected rather than hard-deleted, matching this repo's retain-never-delete
posture elsewhere). A visitor's "Ask a question" submission (any signed-out visitor,
`app/api/programs/[id]/faq-questions/route.ts` — honeypot checked before the rate limit,
same order as `app/api/contact/route.ts`) always lands `DRAFT`/`source: "visitor"` with a
server-stamped `consentAt` and salted `ipHash`; nothing ever auto-publishes. Consent is
enforced the same three-times-over way as `PollReview`: the client only sends the field
when the box was checked, `lib/programFaqShared.ts`'s `faqQuestionSubmitSchema` requires
`consent: z.literal(true)`, and the DB has a hand-written conditional `CHECK` (only
applies when `source = 'visitor'` — admin-authored rows have no consent concept at all;
`IS TRUE` rather than a bare boolean reference, for the same NULL-passes-CHECK reason as
`PollReview`'s constraint — see the migration comment). Publishing is refused in
`lib/programFaq.ts`'s `updateFaq` while `answer` is null/empty, so a visitor question with
no answer yet can't accidentally go live. `deleteFaq` refuses any `source === "visitor"`
row (reject it instead); only admin-authored drafts that never had public exposure can be
hard-deleted. `/admin/polls/faqs` (`FaqManager.tsx`) has the pending-questions queue
(answer-and-publish or reject-with-note) on top and per-program curated CRUD
(add/edit/reorder/publish/unpublish) below, mirroring `PollReviewQueue`'s and
`BucketManager`'s conventions respectively; its pending count feeds both the FAQs tab
badge and the `/admin` "Ratings" nav badge (summed with pending reviews).
`components/ProgramFaqSection.tsx` renders published entries on the program page (below
`ReviewsSection`) gated purely on each entry's own `PUBLISHED` status — not the poll
kill switch or `resultsVisible`, since a FAQ entry isn't aggregate poll data. Zero
published entries renders nothing but the always-present "Ask a question" button
(`AskQuestionForm.tsx`) — no empty-state placeholder.

**The public poll link** surfaces the existing per-program `/rate/[slug]?ref=TOKEN` link
(previously admin-only, minted by hand at `/admin/polls/links`) as a visible
"Share / fill out this program's poll" button on the program page
(`components/polls/PublicPollLink.tsx`), gated by a new per-program
`ProgramPollConfig.pollLinkPublic` boolean that mirrors `resultsVisible`'s toggle pattern
exactly (same checkbox styling in `ProgramPollConfigManager.tsx`, same PATCH route).
**Deliberately independent of `resultsVisible` and the kill switch** — this toggle gates
*capture* (can visitors reach the anonymous submission form at all), not *results*
display; a program can accept public poll submissions while its score/reviews stay dark,
or vice versa. Flipping it on **lazily mints exactly one designated `ReferrerToken`**
(label `"Public program page"`, uncapped, no expiry) via the existing
`lib/pollTokens.ts`'s `mintReferrerToken`, storing its id in the new
`ProgramPollConfig.publicTokenId` (`@unique`) — re-toggling off/on reuses that same token
rather than minting a fresh one each time, so its accumulated response history stays
attached to one row in `/admin/polls/links` instead of fragmenting. `lib/pollConfig.ts`'s
`getPublicPollLink(programId)` is the only reader that should build a public-facing URL
from this (returns the relative `/rate/[slug]?ref=...` path, or `null` when the toggle is
off or no token has been minted yet); the client component prepends
`window.location.origin`, same convention as `PollLinkManager.tsx`'s `tokenUrl`.

Both additions shipped in one migration
(`20260718183503_add_program_faq_and_public_poll_link`) alongside the `ProgramFAQ` table
— same "never `prisma db push` against this schema" warning as the two alumni-polls
migrations before it, for the same hand-written-CHECK-constraint reason.

### Homepage hero video: an optional, site-wide YouTube/Vimeo feature (not per-program)
`/admin/settings`' "Homepage Video" section (`components/HomeVideoForm.tsx` →
`PATCH /api/admin/home-video`) configures one featured video shown on the homepage
below the welcome heading, above Featured/Recently Added
(`components/HomeVideoHero.tsx`, rendered from `app/page.tsx`). Off by default; two
independent `SiteContent` keys (`homeVideoEnabled`, `homeVideo`) mean hiding the
section never loses the saved config and editing the config while hidden never
silently turns it on (`lib/homeVideo.ts`'s `setHomeVideoEnabled`/`saveHomeVideoConfig`
each touch only their own key). Same client/server split precedent as `lib/tagTints.ts`:
`lib/homeVideoConfig.ts` holds the pure zod schema/types/parsers `HomeVideoForm.tsx`
and `HomeVideoHero.tsx` need (`"use client"` components can't import `lib/homeVideo.ts`,
which pulls in `lib/siteContent.ts` → `lib/prisma.ts` → `pg`), while `lib/homeVideo.ts`
keeps the Prisma-backed reads/writes and re-exports the split file's symbols.

Reuses `lib/videoEmbed.ts`'s `parseVideoLink` for the same canonicalized-URL discipline
the per-program video system relies on (the route only ever stores the canonical
`embedUrl`/`watchUrl` it derives, never the raw pasted string), and imports
`components/VideoList.tsx`'s exported `EMBED_SANDBOX`/`EMBED_ALLOW`/
`EMBED_REFERRER_POLICY` constants so the homepage hero's iframe gets identical
sandboxing instead of a parallel copy. Posters: Vimeo's is resolved via oEmbed at save
time (`lib/homeVideo.ts`'s `fetchVimeoPosterUrl` — any failure degrades to a
poster-less facade, never blocks the save); YouTube's is derived from the video id with
no network call (`lib/homeVideoConfig.ts`'s `youtubePosterFromEmbedUrl` builds
`https://img.youtube.com/vi/<id>/hqdefault.jpg` directly). An admin-supplied
`posterOverrideUrl` always wins over the derived one (`effectivePosterUrl`). `next.config.ts`'s
CSP `img-src` allowlists both `img.youtube.com` and `i.vimeocdn.com` for these thumbnails.

## Local setup essentials

- `DATABASE_URL` (Neon Postgres) in both `.env` and `.env.local`.
- Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) in `.env.local`
  — `next dev` will issue temporary keyless credentials if these are absent, but a
  production build (`next start`) requires real ones.
- `BLOB_READ_WRITE_TOKEN` in `.env.local` powers program-logo uploads (`lib/storage.ts`'s
  `saveLogo`) and the legacy/branding Blob paths (see Upload storage above). As of
  2026-07-23 the connected store works, so this token produces live URLs — you need it to
  exercise logo upload locally. Video (YouTube/Vimeo embeds) and branding (static
  `/public/brand/` files) don't touch Blob, so the rest of the app develops fine without it.
- `RESEND_FROM` must end in `@israelprogramswiki.com` (`lib/email.ts`'s
  `getOutreachFromAddress`) for outreach or alumni-rating magic-link emails to send at
  all — `onboarding@resend.dev` or any other address fails the domain check and the
  send is refused (never thrown; the caller sees `{ ok: false }`).
- `POLL_IP_SALT` is required once `NODE_ENV=production` (a local `next dev` falls back
  to a hardcoded dev salt) — see "Alumni ratings" above.
- First admin has to be set by hand once: sign up in the app, then in the Clerk
  dashboard set that user's **public metadata** to `{ "role": "admin" }`. After that,
  `/admin` can promote/demote other users without touching Clerk directly.
- This project is linked to a Vercel project (`vercel link`) deployed via GitHub
  integration — `vercel env pull` targets a specific environment (default
  `development`) and **overwrites** the target file with only that environment's
  vars; vars marked "sensitive" in Vercel pull back as empty strings even when the
  variable exists. Don't assume an env-pull is purely additive.
