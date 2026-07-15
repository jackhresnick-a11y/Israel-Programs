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
can't exercise a signed-in-non-admin session directly) and `lib/folders.test.ts` (an IDOR
lockdown suite for `lib/folders.ts`'s ownership checks, using a hand-rolled in-memory
Prisma fake via `vi.mock("@/lib/prisma")` rather than a real database). This covers
pure-logic `lib/*.ts` functions behind `vi.mock`-able boundaries, not routes, pages, or
anything that needs a real Postgres connection — most verification in this project is
still `npx tsc --noEmit`, `npm run lint`, exercising the feature via `curl`/the running dev
server, and (for data changes) querying Neon directly. Follow `lib/roles.test.ts`'s
pattern (hoisted mocks, dynamic `await import(...)` after `vi.mock`) if adding to this
suite rather than introducing a different testing style.

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
used **only** by the two "suggestion" routes (new Program creation, proposed edits) —
banning intentionally does not block reviews, references, videos, or contact requests.
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

### Upload storage: video is YouTube/Vimeo embeds; branding is static `/public` files (the Blob store is suspended)
This changed materially in July 2026. The project's Vercel **Blob store is suspended** —
the Hobby plan's ~10 GB/month data-transfer cap was blown by serving program video mp4s
directly, so *every* blob URL (videos **and** the brand images that used to live there)
now returns `403 "Your store is blocked"` for anyone without a warm browser cache (which
is why a bug can look like it only affects signed-out visitors — a signed-in dev's disk
cache masks it). Both upload surfaces were routed **off Blob**; don't reintroduce
Blob-backed uploads.

- **Video is now embeds, not file uploads.** `components/VideoUploader.tsx` takes a
  pasted YouTube/Vimeo **link**. `app/api/programs/[id]/videos/route.ts` runs it through
  `lib/videoEmbed.ts`'s `parseVideoLink` (accepts the common watch/share/embed link
  shapes for both providers, canonicalizes server-side to a safe
  `youtube-nocookie.com/embed/<id>?rel=0` or `player.vimeo.com/video/<id>` URL, and
  **rejects anything else** — a pasted URL is never trusted as an iframe src) and stores
  the canonical URL with `mimeType: "embed/<provider>"`. `components/VideoList.tsx`'s
  `VideoPlayer` branches on `isEmbedUrl(url)` (matched on the canonical hostname, **not**
  the client-influenced stored mimeType): embeds render as a 16:9 `<iframe>`, legacy Blob
  file URLs keep the `<video>` element and its CDN-propagation retry. The old
  browser-direct-Blob path (`app/api/videos/upload/route.ts` + `@vercel/blob/client`'s
  `upload()`, gated by `requireSignedIn`) still exists and the record route still accepts
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
  `app/api/site-logo/upload/route.ts`) and `lib/storage.ts`'s `saveLogo` still target
  Blob (or read-only local disk) and will error while the store is suspended — set
  branding by committing a file to `public/brand/` and pointing the SiteContent key at
  it, not via the admin upload UI.
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

### AI layer exists but is fully dormant
`lib/ai/` defines an `AIProvider` interface with a `NullProvider` (default) and
`AnthropicProvider`, switched by `isAIEnabled()` (`AI_ENABLED=true` + `ANTHROPIC_API_KEY`
in env). As of now **nothing in the app calls `getAIProvider()`** — it's scaffolding
for a future AI-powered surface, not a currently-active feature. Don't assume any
existing behavior is AI-driven.

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

## Local setup essentials

- `DATABASE_URL` (Neon Postgres) in both `.env` and `.env.local`.
- Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) in `.env.local`
  — `next dev` will issue temporary keyless credentials if these are absent, but a
  production build (`next start`) requires real ones.
- `BLOB_READ_WRITE_TOKEN` in `.env.local` is only needed for the **legacy** Blob upload
  path (see Upload storage above) — new video is YouTube/Vimeo embeds and branding is
  static `/public` files, neither of which touches Blob. The store is currently
  suspended, so this token doesn't produce working URLs regardless; you can develop the
  current features without it.
- First admin has to be set by hand once: sign up in the app, then in the Clerk
  dashboard set that user's **public metadata** to `{ "role": "admin" }`. After that,
  `/admin` can promote/demote other users without touching Clerk directly.
- This project is linked to a Vercel project (`vercel link`) deployed via GitHub
  integration — `vercel env pull` targets a specific environment (default
  `development`) and **overwrites** the target file with only that environment's
  vars; vars marked "sensitive" in Vercel pull back as empty strings even when the
  variable exists. Don't assume an env-pull is purely additive.
