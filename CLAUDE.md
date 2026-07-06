# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

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
`apply-facet-tags.ts`, `apply-good-for.ts`, `seed-mission.ts`) that talk to Prisma
directly; running them with bare `npx tsx prisma/whatever.ts` will fail to connect
because `DATABASE_URL` isn't in the environment. Load it first:

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
deliberately no one-click "approve entire edit" path anymore.

Reviews (`Review` model) are **not moderated at all** — they publish immediately, and
only deletion is moderator-gated. Don't assume all user-generated content follows the
same review pipeline; check which one a given model actually uses.

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

### Upload storage is currently broken in production — know this before touching it
`lib/storage.ts` writes logo/video uploads to local disk (`public/uploads/`). **This
does not work on Vercel**: serverless functions there have a read-only filesystem
(breaks every upload with a 500) and a hard ~4.5 MB request-body limit (breaks large
files with a 413) that cannot be raised. Diagnosed and confirmed in production; not
yet fixed. Any work touching uploads should assume a migration to browser-direct
Vercel Blob uploads (bypassing both limits) is the intended direction, not patch the
local-disk path further.

### The xlsx export is DB-backed, not file-based — and that's deliberate
`lib/programExport.ts` does **not** write a file to disk. It was originally
implemented that way and broke in production for the same filesystem reasons as
uploads above; it now maintains `ProgramExportRow` — an immutable, append-only log
table with no FK to `Program` (so a row survives even if its program is later renamed
or deleted) — and generates the `.xlsx` fresh in memory, on demand, at download time
(`app/api/admin/programs-xlsx/route.ts`). `instrumentation.ts`'s `register()` runs a
reconciliation sweep on every server boot to catch any Program row created outside the
normal `createProgram()` path (direct DB inserts, scripts); since the reconciled state
lives in Neon rather than local disk, this works identically on a Vercel cold start or
local `next dev`. If you're tempted to write a file for some other feature, this is
the cautionary precedent — prefer DB-backed or object-storage-backed state instead.

### AI layer exists but is fully dormant
`lib/ai/` defines an `AIProvider` interface with a `NullProvider` (default) and
`AnthropicProvider`, switched by `isAIEnabled()` (`AI_ENABLED=true` + `ANTHROPIC_API_KEY`
in env). As of now **nothing in the app calls `getAIProvider()`** — it's scaffolding
for a future AI-powered surface, not a currently-active feature. Don't assume any
existing behavior is AI-driven.

## Local setup essentials

- `DATABASE_URL` (Neon Postgres) in both `.env` and `.env.local`.
- Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) in `.env.local`
  — `next dev` will issue temporary keyless credentials if these are absent, but a
  production build (`next start`) requires real ones.
- First admin has to be set by hand once: sign up in the app, then in the Clerk
  dashboard set that user's **public metadata** to `{ "role": "admin" }`. After that,
  `/admin` can promote/demote other users without touching Clerk directly.
- This project is linked to a Vercel project (`vercel link`) deployed via GitHub
  integration — `vercel env pull` targets a specific environment (default
  `development`) and **overwrites** the target file with only that environment's
  vars; vars marked "sensitive" in Vercel pull back as empty strings even when the
  variable exists. Don't assume an env-pull is purely additive.
