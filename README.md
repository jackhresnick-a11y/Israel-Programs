# Israel Programs Wiki

A community-editable directory of Jewish Israel programs (gap years, 10-day
summer trips, semester programs, internships, etc.) with reviews, video
uploads, keyword/hashtag search, and moderator-managed content.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (local dev) via the `@prisma/adapter-better-sqlite3` driver
  adapter — swap to Postgres by changing `prisma/schema.prisma`'s
  `datasource` provider and installing a Postgres adapter when you're ready
  to deploy
- Clerk for authentication and roles (`user` / `moderator` / `admin`, stored
  in `publicMetadata.role`)
- Local-disk file storage for logos/videos under `public/uploads/`, behind
  `lib/storage.ts` so it can be swapped for S3/R2/Cloudinary later

## Getting started

```bash
npm install
npx prisma generate
npx prisma migrate dev   # creates dev.db
npx prisma db seed       # loads sample programs
npm run dev
```

Visit http://localhost:3000.

### Auth (Clerk)

On first run under `npm run dev`, Clerk automatically issues **temporary
keyless credentials** — no signup required to try the app. The terminal
prints a "claim your keys" link; visiting it lets you claim the temporary
Clerk application (or create your own at https://dashboard.clerk.com and
paste its API keys into `.env.local` under
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`).

Keyless mode only works in `next dev`. `npm run build && npm run start`
(production mode) requires real keys in `.env.local` — set those before
trying a production build.

### Becoming a moderator/admin (bootstrap)

New sign-ups default to the `user` role. Admins can promote other users to
`moderator`/`admin` from `/admin` in the app — but the *first* admin has to
be set manually, since no one can visit `/admin` yet:

1. Sign up in the app once.
2. Go to the Clerk Dashboard (via the "claim your keys" link, or
   https://dashboard.clerk.com if you configured your own app) → **Users** →
   select your user → **Metadata** → add to **Public metadata**:
   ```json
   { "role": "admin" }
   ```
3. Reload the app — you'll see "Add Program" and "Admin" links in the nav.
   From `/admin` you can promote/demote other users without touching Clerk
   directly again.

## Project structure

- `app/programs` — browse/search, program detail, create, edit
- `app/admin` — role management (admin only)
- `app/api` — route handlers for programs, videos, reviews, admin role changes
- `lib/programs.ts` — Program data access + search/filter queries
- `lib/storage.ts` — local-disk upload handling (logo/video)
- `lib/roles.ts` — Clerk role helpers used by pages and API routes
- `prisma/schema.prisma` — Program / Tag / Video / Review models
- `prisma/seed.ts` — sample programs for local testing

## Notes

- Reviews publish immediately; moderators can delete any review or video.
- Search matches program name/description/organization plus exact tag
  (hashtag) filters; combine `?q=` and `?tag=` on `/programs`.
- Uploaded files live in `public/uploads/` (gitignored) and the SQLite file
  is `dev.db` (also gitignored) — both are local-only for now.
