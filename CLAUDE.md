# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

`docs/PRODUCT_SPEC.md` is the product roadmap ("Living document," currently v0.1) —
check it for target-state product direction beyond what's already built. Its own
"Current State" section (§0) is partially stale (it still says "Prisma + SQLite"; the
live stack is Prisma + Postgres/Neon, per this file) — trust CLAUDE.md over §0 for what
actually exists today, and the spec for where things are headed.

`README.md`'s "Stack"/"Project structure"/"Notes" sections are also stale on upload
storage — they describe logos *and* videos as local-disk under `public/uploads/`. That
was true once, but per "Upload storage" below, video now uploads browser-direct to
Vercel Blob; only logo is still local-disk (and still broken in production). Trust this
file over the README for upload storage specifics.

## Commands

```bash
npm run dev              # start dev server (Turbopack, http://localhost:3000)
npm run build             # production build
npm run start             # run a production build
npm run lint              # eslint (flat config: eslint-config-next core-web-vitals + typescript)
npx tsc --noEmit          # typecheck — there is no dedicated script for this, use directly
```

**No test suite exists in this repo.** There is no test runner, no test files, and no
`test` script — don't assume Jest/Vitest conventions or try to "run the tests."
Verification in this project means: `npx tsc --noEmit`, `npm run lint`, exercising the
feature via `curl`/the running dev server, and (for data changes) querying Neon directly.

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
may render — `contactEmail`/`userId` must never reach a client component's props, since
Next.js serializes client-component props into the page's RSC payload and they end up in
the raw HTML even for fields the JSX never displays. Follow the same
select-only-what's-public pattern for any other model with a mix of public and
sensitive fields (e.g. `ContactRequest`, which carries `requesterEmail`).

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

### Tags: flat model, optional category, principled split from structured attributes
`Tag` has an optional `category` (`location` / `affiliation` / `population` / `gender`
today; most tags are uncategorized/general). Multi-select filtering in
`lib/programs.ts` groups selected tag slugs by category and **ORs within a category,
ANDs across categories** (e.g. two "location" tags match either; a "location" tag plus
a "gender" tag requires both) — see the category-grouping helper in `listPrograms`.

Deliberate modeling principle: attributes that are booleans or a small fixed set of
tiers get **real typed `Program` columns**, not tags — `hasScholarship`,
`hasCollegeCredit`, `travelType` (`TravelType` enum) exist specifically because they
used to be tags and that was the wrong shape. If a new attribute is genuinely a
boolean/enum rather than a freeform identity/vibe descriptor, follow that precedent
instead of adding another tag.

### Upload storage: video is on Vercel Blob, logo is not (and is still broken)
The two upload surfaces do **not** share an implementation, and it's important not to
conflate them:

- **Video** (`components/VideoUploader.tsx`) uploads browser-direct to Vercel Blob via
  `@vercel/blob/client`'s `upload()`, authorized by the token route at
  `app/api/videos/upload/route.ts` (`handleUpload`, gated by `requireSignedIn`). The
  video file itself never touches a serverless function — `app/api/programs/[id]/videos/route.ts`
  only receives a JSON `{url, filename, mimeType, caption}` body afterward and records it
  against the Program, after checking the URL's hostname ends with
  `.public.blob.vercel-storage.com` (don't accept arbitrary URLs there). This requires a
  **Public**-access Blob store connected to the project with `BLOB_READ_WRITE_TOKEN` set
  — a Private-access store will reject/mismatch the public-URL assumption both here and
  in playback (`<video src={video.url}>` in `components/VideoList.tsx` can't attach an
  auth header for a private blob). For local dev, pull/set `BLOB_READ_WRITE_TOKEN` in
  `.env.local` the same way `DATABASE_URL` is set up.
- **Logo** (`lib/storage.ts`'s `saveLogo`, called from `app/api/programs/route.ts` and
  `app/api/programs/[id]/route.ts`) still writes to local disk (`public/uploads/logos/`)
  and **does not work on Vercel** for the same reasons video used to fail: the
  serverless function filesystem is read-only (500s) and the ~4.5MB request-body limit
  rejects larger files (413s). This is known, unfixed, and the next candidate for the
  same browser-direct-Blob treatment video just got — don't assume `saveLogo` works in
  production, and don't reuse it as a reference implementation for new uploads.

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
- `BLOB_READ_WRITE_TOKEN` in `.env.local` for video uploads to work locally — must be
  issued against a **Public**-access Vercel Blob store (see Upload storage above); a
  token from a Private store will not produce working video URLs.
- First admin has to be set by hand once: sign up in the app, then in the Clerk
  dashboard set that user's **public metadata** to `{ "role": "admin" }`. After that,
  `/admin` can promote/demote other users without touching Clerk directly.
- This project is linked to a Vercel project (`vercel link`) deployed via GitHub
  integration — `vercel env pull` targets a specific environment (default
  `development`) and **overwrites** the target file with only that environment's
  vars; vars marked "sensitive" in Vercel pull back as empty strings even when the
  variable exists. Don't assume an env-pull is purely additive.
