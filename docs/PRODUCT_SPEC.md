# Israel Programs Platform — Product Specification & Technical Roadmap

> **Status:** Living document. Version 0.1 (2026-07-05).
> **Purpose:** A complete, opinionated blueprint another engineer or AI could use to evolve the current MVP into the definitive decision-making platform for Israel programs.
> **Guiding principle:** This is not a directory. It is a *personalized decision-making platform*. Every architectural choice below optimizes for **clarity, trust, transparency, and ease of comparison**.

---

## 0. Current State (what already exists)

The MVP already built (see `README.md`):

- **Next.js 16 (App Router) + TypeScript + Tailwind**, **Prisma + SQLite**, **Clerk** auth (user/moderator/admin roles in `publicMetadata.role`).
- **Program** CRUD with attributes (name, org, location, durationType, cost, signup info, contact, logo), **Tag** many-to-many, **Video** uploads, structured **Review** model.
- **Moderation workflow**: any signed-in user can submit a program or propose an edit; non-moderators' submissions become `PENDING` and enter an `/admin` approval queue (`ProgramStatus`, `ProgramEdit`). Moderators/admins publish instantly.
- Local-disk media storage behind a swappable `lib/storage.ts` abstraction.

**This spec treats the above as the foundation and describes the target state plus the migration path.** Where the target differs from today, it is called out as **[CHANGE]**.

---

## 1. Product Requirements Document (PRD)

### 1.1 Mission
Become the definitive resource for anyone deciding which Israel program best fits them — matching on goals, personality, religious background, interests, budget, and long-term plans — with radical transparency and effortless comparison.

### 1.2 Target users (personas)
1. **The Prospective Participant (primary)** — a 16–26-year-old (or their equivalent) choosing a gap year, seminary/yeshiva, summer trip, or post-college program. Overwhelmed by options, unsure what fits.
2. **The Parent** — cares about safety, cost, supervision, religious environment, outcomes, and trustworthy reviews.
3. **The Advisor** — a school GPA/Israel-guidance counselor, rabbi, or youth director who recommends programs to many students and wants a comparison/short-list tool.
4. **The Alumnus** — wants to give back: write structured reviews, answer questions, mentor.
5. **The Program Operator** — wants an accurate, rich profile and to respond to reviews (V2+).
6. **The Moderator/Editor (internal)** — curates data quality, approves submissions, resolves disputes.

### 1.3 Problem statement
Existing resources are fragmented directories with shallow, inconsistent, often marketing-controlled data. There is no neutral, standardized, comparison-first platform that captures the *lived experience* (lifestyle, religious environment, honest fit) and connects it to *outcomes* and *personal fit*.

### 1.4 Goals & success metrics
- **Activation:** % of visitors who complete the Matching Quiz.
- **Depth:** median programs viewed per session; comparison-tool usage rate.
- **Trust:** review submission rate; % programs with ≥5 structured reviews; reported-data-error resolution time.
- **Outcome:** click-through to program "apply/contact"; saved short-lists; returning users.
- **Coverage:** # published programs; % with complete facet profiles (target: 90% of core facets filled).

### 1.5 Non-goals (initially)
- Not a booking/payment platform (link out to programs to apply).
- Not a social network (alumni network is lightweight Q&A, not a feed).
- No user-generated program *pages* without moderation (quality > volume).

---

## 2. Information Architecture

### 2.1 Site map
```
/                         Home: value prop, quiz CTA, featured + categories
/quiz                     Matching quiz (flagship)
/quiz/results             Ranked, explained recommendations
/programs                 Browse: search + faceted filters + list/grid
/programs/[slug]          Program profile (tabbed facets)
/compare?ids=a,b,c        Side-by-side comparison tool
/programs/new             Submit a program (any signed-in user → PENDING)
/programs/[slug]/edit     Propose an edit (→ PENDING ProgramEdit)
/alumni                   Alumni network directory (opt-in profiles)
/alumni/[handle]          Alumnus profile + "ask a question"
/guides                   Editorial guides ("Gap year vs. seminary", "Aliyah 101")
/guides/[slug]            Long-form guide (MDX)
/saved                    User's saved short-list / compare sets
/account                  Profile, saved items, quiz history, review history
/admin                    Moderation queue, data health, taxonomy, users
/sign-in /sign-up         Clerk
```

### 2.2 Content model overview
Three content tiers:
1. **Structured program data** (Postgres, relational) — powers search, filtering, matching, comparison. The bulk of the product.
2. **Community content** (Postgres) — reviews, alumni profiles, Q&A, reported corrections.
3. **Editorial content** (MDX in-repo or headless CMS at V2) — guides, glossary, decision frameworks. Improves SEO and top-of-funnel.

### 2.3 Global navigation
Primary nav: **Find My Program (quiz)** · **Browse** · **Compare** · **Guides** · **Alumni**. Persistent "Save" affordance on every program card. Account menu (Clerk `UserButton`).

---

## 3. Database Schema

### 3.1 The central design decision: how to model dozens of facets

The product needs ~80+ descriptive attributes per program across Lifestyle, Community Fit, Religious Environment, Israel Experience, Outcomes, and Aliyah Prep. Three options:

| Approach | Pros | Cons |
|---|---|---|
| **Wide table** (one column per attribute) | Simple, typed, easy queries | Rigid; every new rating dimension = migration; comparison/matching code hard-codes columns; sparse |
| **Pure JSON blob** | Flexible, no migrations | Weak querying, no referential integrity, no admin-editable rubric, easy to drift |
| **✅ Metadata-driven facet rubric (recommended)** | Add dimensions from admin with no migration; generic comparison + matching; consistent rubric | Slightly more join complexity (mitigated by a denormalized cache) |

**Opinionated recommendation: a two-tier model.**

- **Tier 1 — first-class typed columns** on `Program` for *hard facts* that must be filtered/sorted and have fixed semantics (cost min/max, age min/max, dates, enums, arrays).
- **Tier 2 — a facet rubric system** (`FacetGroup` → `FacetDefinition` → `ProgramFacetValue`) for the many *rated/qualitative* dimensions (0–5 scales, enums, booleans, short text). New dimensions are added as data, not migrations. A denormalized `facetsCache` JSON column on `Program` gives O(1) reads for profile/compare pages; it is recomputed on write.

This makes the **comparison tool and matching engine generic** (they iterate over facet definitions), and lets moderators evolve the rubric without engineering.

### 3.2 Prisma schema (target — builds on the existing models)

```prisma
// ---------- Enums ----------
enum ProgramStatus { PENDING PUBLISHED REJECTED ARCHIVED }   // ARCHIVED [CHANGE]
enum EditStatus { PENDING APPROVED REJECTED }

enum ProgramType {                       // [CHANGE] replaces free-form durationType-only
  TEN_DAY_TRIP SUMMER_TRIP SUMMER_INTERNSHIP SEMESTER GAP_YEAR
  YESHIVA SEMINARY UNIVERSITY VOLUNTEER INTERNSHIP ULPAN OTHER
}
enum ReligiousAffiliation {
  SECULAR PLURALIST REFORM CONSERVATIVE MODERN_ORTHODOX
  RELIGIOUS_ZIONIST HAREDI CHABAD SEPHARDIC_TRADITIONAL NON_DENOMINATIONAL
}
enum ZionistOutlook { NON_ZIONIST CULTURALLY_CONNECTED ZIONIST STRONGLY_ZIONIST NEUTRAL }
enum Gender { MENS WOMENS COED SEPARATE_TRACKS }
enum FacetType { SCALE_0_5 ENUM BOOLEAN SHORT_TEXT }

// ---------- Core ----------
model Program {
  id           String   @id @default(cuid())
  slug         String   @unique
  name         String
  organization String?
  status       ProgramStatus @default(PENDING)

  // Tier-1 hard facts (queryable/filterable)
  programTypes         ProgramType[]
  religiousAffiliation ReligiousAffiliation?
  zionistOutlook       ZionistOutlook?
  gender               Gender?
  ageMin               Int?
  ageMax               Int?
  costMin              Int?          // USD, normalized for range filtering
  costMax              Int?
  costNotes            String?       // human string, e.g. "Free" / "before Masa grants"
  scholarshipsAvailable Boolean @default(false)
  durationWeeksMin     Int?
  durationWeeksMax     Int?
  applicationDeadline  DateTime?
  rollingAdmissions    Boolean @default(false)
  languages            String[]      // ["English","Hebrew"]
  housingType          String?       // "Dorms" | "Apartments" | "Homestay" | ...
  mealsProvided        String?
  academicCredit       Boolean @default(false)
  insuranceIncluded    Boolean @default(false)
  visaSupport          Boolean @default(false)
  hasOverseasProgram   Boolean @default(true) // false = Israeli-students-only

  description        String
  logoUrl            String?
  signupInstructions String?
  signupUrl          String?
  contactEmail       String?
  contactPhone       String?
  contactWebsite     String?

  // Denormalized facet snapshot for fast reads (recomputed on write)
  facetsCache Json?

  // Computed / cached aggregates
  aliyahPrepScore Int?     // 0-100, computed (deterministic now, AI-tunable later)
  ratingAvg       Float?
  ratingCount     Int      @default(0)

  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  locations    ProgramLocation[]
  tags         Tag[]     @relation("ProgramTags")
  videos       Video[]
  reviews      Review[]
  edits        ProgramEdit[]
  facetValues  ProgramFacetValue[]
  outcomes     ProgramOutcome[]

  @@index([status])
  @@index([religiousAffiliation])
  @@index([costMin, costMax])
}

model ProgramLocation {
  id        String  @id @default(cuid())
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  city      String
  region    String? // "Gush Etzion", "Golan", "Negev"
  lat       Float?
  lng       Float?
}

// ---------- Facet rubric (Tier-2, metadata-driven) ----------
model FacetGroup {         // "Lifestyle", "Religious Environment", "Israel Experience", ...
  id          String @id @default(cuid())
  key         String @unique
  label       String
  sortOrder   Int    @default(0)
  definitions FacetDefinition[]
}
model FacetDefinition {    // "Torah learning intensity", "Curfew strictness", "Hiking"
  id          String   @id @default(cuid())
  groupId     String
  group       FacetGroup @relation(fields: [groupId], references: [id])
  key         String   @unique
  label       String
  type        FacetType
  enumOptions String[] // for ENUM type
  helpText    String?
  matchWeightDefault Float @default(1) // used by the matching engine
  sortOrder   Int      @default(0)
  values      ProgramFacetValue[]
}
model ProgramFacetValue {
  id           String @id @default(cuid())
  programId    String
  program      Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  definitionId String
  definition   FacetDefinition @relation(fields: [definitionId], references: [id])
  numericValue Float?   // SCALE_0_5
  boolValue    Boolean? // BOOLEAN
  textValue    String?  // ENUM (option key) or SHORT_TEXT
  @@unique([programId, definitionId])
  @@index([definitionId, numericValue])
}

// ---------- Outcomes (Career & Life) ----------
model ProgramOutcome {
  id        String @id @default(cuid())
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  category  String  // "aliyah" | "idf" | "university" | "yeshiva" | "tech" | ...
  metric    String  // "percent" | "count" | "note"
  value     String  // "18%" | "common" | free text
  source    String? // provenance / citation for trust
}

// ---------- Reviews (structured, non-anonymous-lite) ----------
model Review {
  id            String @id @default(cuid())
  programId     String
  program       Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  userId        String
  attendedYear  Int?
  overallRating Int     // 1-5
  wouldRecommend Boolean
  strength      String  // "Biggest strength"
  weakness      String  // "Biggest weakness"
  favoriteMemory String?
  hardestAdjustment String?
  wishIKnew     String?
  // Optional facet-level ratings mirroring the rubric
  facetRatings  Json?
  status        ProgramStatus @default(PENDING) // reviews are moderated too
  createdAt     DateTime @default(now())
  @@index([programId])
}

// ---------- Alumni network ----------
model AlumniProfile {
  id            String @id @default(cuid())
  userId        String @unique
  handle        String @unique
  displayName   String
  currentCity   String?
  currentCareer String?
  programsAttended Json?   // [{programId, year}]
  openToQuestions Boolean @default(true)
  bio           String?
  createdAt     DateTime @default(now())
  questions     AlumniQuestion[]
}
model AlumniQuestion {
  id         String @id @default(cuid())
  alumniId   String
  alumni     AlumniProfile @relation(fields: [alumniId], references: [id], onDelete: Cascade)
  askedById  String
  body       String
  answer     String?
  answeredAt DateTime?
  createdAt  DateTime @default(now())
}

// ---------- Matching quiz ----------
model QuizResponse {
  id         String @id @default(cuid())
  userId     String?   // nullable: allow anonymous quiz, claim on sign-up
  answers    Json      // { facetKey/questionKey: value }
  weights    Json      // derived preference weights
  results    Json      // ranked [{programId, score, reasons[]}]
  createdAt  DateTime @default(now())
}

// ---------- Data-quality / trust ----------
model CorrectionReport {   // "report an inaccuracy" on any program
  id         String @id @default(cuid())
  programId  String
  field      String?
  message    String
  reportedBy String?
  resolved   Boolean @default(false)
  createdAt  DateTime @default(now())
}

model SavedItem {           // short-lists / compare sets
  id        String @id @default(cuid())
  userId    String
  programId String
  createdAt DateTime @default(now())
  @@unique([userId, programId])
}

// Tag, Video, ProgramEdit: as in current schema (extend ProgramEdit.payload to new fields)
```

### 3.3 Seeding the rubric
`FacetGroup`/`FacetDefinition` are **seed data** (see §5 of features below and the seed script). The six groups map directly to the requested feature areas:
- **Lifestyle** — daily schedule, free time, curfew strictness, weekend structure, phone policy, transportation, dorm quality, internet, laundry, food quality, student-to-staff ratio, independence level, physical fitness expectations.
- **Religious Environment** — prayer expectations, Torah learning intensity, Shabbat atmosphere, dress expectations, kashrut standards, mixed-gender activities, women's learning opportunities, halachic expectations.
- **Israel Experience** — hiking, desert trips, Jerusalem exposure, Tel Aviv exposure, Golan, Galilee, kibbutzim, volunteering, archaeology, Hebrew immersion, Israeli culture, security education.
- **Community Fit** — personality tags (introverted/extroverted/academic/outdoorsy/leadership/entrepreneurial/artistic/highly-structured/independent/social) + "who would struggle here."
- **Aliyah Prep** — Hebrew, bureaucracy, employment, housing, Israeli culture, community integration, long-term support (these feed the computed Aliyah Prep Score).
- **Honest Fit** — "who should choose this" / "who should avoid this" (SHORT_TEXT, always shown).

---

## 4. API Design

RESTful Route Handlers under `app/api` (Next.js), plus Server Actions for form mutations. JSON in/out; Clerk-gated writes; Zod validation at the boundary.

```
# Programs
GET    /api/programs                     ?q=&type=&affiliation=&costMax=&facet.<key>=&sort=&page=
GET    /api/programs/:id
POST   /api/programs                     (signed-in → PENDING; moderator → PUBLISHED)
PATCH  /api/programs/:id                 (moderator applies; others → ProgramEdit)
DELETE /api/programs/:id                 (moderator)
POST   /api/programs/:id/report          (correction report)

# Facets & taxonomy
GET    /api/facets                       (groups + definitions; drives compare & filters)
PUT    /api/admin/programs/:id/facets    (moderator: set facet values; recomputes cache)

# Comparison
GET    /api/compare?ids=a,b,c            (normalized facet matrix for side-by-side)

# Matching quiz
GET    /api/quiz/schema                  (questions + how they map to facet weights)
POST   /api/quiz                         (answers → { results:[{programId,score,reasons[]}] })

# Reviews
GET    /api/programs/:id/reviews
POST   /api/programs/:id/reviews         (signed-in; structured; → PENDING)
DELETE /api/reviews/:id                  (moderator)

# Alumni
GET    /api/alumni                       ?program=&city=&career=
POST   /api/alumni                       (create/update own profile)
POST   /api/alumni/:handle/questions     (ask)
POST   /api/alumni/questions/:id/answer  (answer own)

# Saved / account
GET/POST/DELETE /api/saved

# Admin
GET    /api/admin/queue                  (pending programs + edits + reviews + reports)
POST   /api/admin/programs/:id/approve|reject
POST   /api/admin/edits/:id/approve|reject
PATCH  /api/admin/users/:id/role

# AI (all behind AI_ENABLED flag; deterministic fallback otherwise)
POST   /api/ai/search                    (natural-language → structured query)
POST   /api/ai/match-explain             (enrich quiz reasons)
POST   /api/ai/summarize-reviews         (per-program review digest)
POST   /api/ai/assistant                 (conversational onboarding / comparison Q&A)
```

**Design notes**
- The **facet-driven filter grammar** (`facet.torah_intensity_min=4`) keeps browse/search generic as the rubric grows.
- `/api/quiz` returns **reasons per recommendation** from day one (deterministic templates); `/api/ai/match-explain` later upgrades them to natural language without changing the contract.
- All list endpoints return the same normalized program DTO used by cards, compare, and quiz results (single source of truth).

---

## 5. UI/UX Structure

### 5.1 Key screens & component hierarchy
- **Home** — Hero + "Find my program" quiz CTA · category tiles (Gap Year / Seminary / Yeshiva / Summer / University / Volunteer) · featured programs · trust signals (review counts, "moderated data").
- **Program Profile** (`/programs/[slug]`) — sticky header (logo, name, key facts, Save + Compare + Apply). **Tabbed facets**: Overview · Lifestyle · Religious Environment · Israel Experience · Outcomes · Reviews · **Honest Fit** (always visible, not buried). Each facet group renders generically from `facetsCache`. Right rail: quick facts, Aliyah Prep Score gauge, "compare with similar."
- **Browse** (`/programs`) — left: faceted filter panel (type, affiliation, gender, cost slider, duration, location, + facet sliders). Main: result grid with `ProgramCard` (rating, tags, key facts). Chips reflect active filters; URL-driven (shareable).
- **Comparison** (`/compare`) — horizontally scrollable table; rows = facet definitions grouped by FacetGroup; columns = programs; visual bars for 0–5 scales; highlight differences; "add program" slot.
- **Quiz** (`/quiz`) — one question per step, progress bar, back/skip, ~12–15 questions. Results page: ranked cards each with an expandable **"Why this matches you"** (reason bullets tied to the user's answers).
- **Alumni** — searchable directory cards; profile page with "Ask a question" (gated, rate-limited).
- **Admin** — queue tabs (Programs / Edits / Reviews / Reports), a **facet editor** per program, taxonomy/rubric manager, data-health dashboard, user roles.

### 5.2 Design system
Keep Tailwind. Introduce a small token layer (color, spacing, radius, elevation) and a component library (`components/ui/*`): `Card`, `Badge`, `RatingBar`, `FacetGauge`, `FilterPanel`, `CompareTable`, `QuizStep`, `Tabs`, `EmptyState`, `Banner`. Light/dark already supported. Accessibility: keyboard-navigable filters, ARIA on tabs/sliders, sufficient contrast, `prefers-reduced-motion`.

---

## 6. User Flows (text diagrams)

**A. Discovery → decision (core loop)**
```
Land on Home → click "Find my program"
  → Quiz (12-15 Qs) → Results (ranked + reasons)
    → open a Program Profile → read Honest Fit + Reviews
      → Save ★  → add 2-3 to Compare
        → /compare side-by-side → pick → click Apply/Contact (out)
```

**B. Browse (self-directed)**
```
/programs → apply filters (type=GAP_YEAR, affiliation=MODERN_ORTHODOX, costMax, facet.torah_intensity_min=4)
  → grid updates (URL updates) → Save/Compare → Profile → Apply
```

**C. Contribute a review (trust loop)**
```
Signed-in alum → Program Profile → "Write a review"
  → structured form (strength/weakness/memory/hardest/wish-I-knew/recommend?)
    → submit → PENDING → moderator approves → appears + updates ratingAvg + review summary
```

**D. Submit / correct data**
```
Any signed-in user → /programs/new (→ PENDING)  OR  Profile → Edit (→ ProgramEdit PENDING)
  OR  Profile → "Report an inaccuracy" (→ CorrectionReport)
    → /admin queue → approve/reject → published/merged
```

**E. Alumni connection**
```
Visitor → /alumni → filter by program/city/career → Profile → "Ask a question"
  → alum notified → answers → Q&A shown on profile (optionally public)
```

**F. Moderator daily**
```
/admin → Queue (Programs | Edits | Reviews | Reports)
  → review diff/content → Approve/Reject → Data-health tab flags incomplete facet profiles
```

---

## 7. Feature Prioritization

### MVP (now → ~6 weeks)  *(no AI; AI code stubs present but flag-off)*
- **[CHANGE] Migrate SQLite → Postgres** (Neon). Prerequisite for search, arrays, JSON, scale.
- Expand `Program` to Tier-1 fields; add facet rubric (`FacetGroup/Definition/Value`) + `facetsCache`.
- Seed rubric + import the ~55 researched programs (`data/researched-programs.json`, deduped).
- **Faceted browse/search** (Postgres tsvector + pg_trgm + structured filters).
- **Program profile with facet tabs + Honest Fit** (always visible).
- **Comparison tool** (up to 4 programs).
- **Structured reviews** (already modeled) + moderation (already built).
- **Matching quiz v1** — deterministic weighted scoring + templated "why" reasons.
- **Save / short-list.**
- **Aliyah Prep Score** — deterministic formula over the Aliyah facet group.
- **Admin**: existing queue + **facet editor** + data-health view.
- **AI abstraction layer** (`lib/ai/`) wired everywhere with `NullProvider` fallbacks (see §12).

### V2 (~next quarter)
- **Typesense** for instant, typo-tolerant, faceted search + synonyms.
- **Alumni network** (profiles + Q&A).
- **Turn AI on** (flag flip): NL search, review summarization, match-explanation, comparison assistant, conversational onboarding.
- **Program-operator accounts** (Clerk Organizations) — claim & respond to reviews (moderated).
- **Editorial guides** (MDX) + glossary → SEO engine.
- **Semantic search & "programs like this"** via embeddings (Voyage AI) + pgvector.
- Media at scale: **Cloudflare R2** + **Mux/Cloudflare Stream** for video.

### Future
- Aliyah-planning assistant; travel-planning assistant.
- Mentorship matching; scholarship database & deadline reminders.
- Verified-attendance reviews (program-issued codes).
- Mobile app (React Native/Expo sharing the API).
- Expansion into the broader ecosystem (see §15).

---

## 8. Technology Stack (opinionated, with rationale)

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | Next.js (App Router) + React + TypeScript + **Tailwind** | Already built; SSR/SSG for SEO; server components reduce client JS; one framework for pages + API. |
| **Backend** | Next.js **Route Handlers + Server Actions** | Co-located, typesafe, no separate service to run at this scale. Extract to a dedicated service only if/when needed. |
| **ORM** | **Prisma** | Already used; typed queries; migrations; supports Postgres + pgvector. |
| **Database** | **PostgreSQL (Neon serverless)** **[CHANGE from SQLite]** | Full-text search, `tsvector`/`pg_trgm`, arrays, JSONB, concurrency, pgvector for embeddings, branching for previews. The facet queries and scale need it. |
| **Auth** | **Clerk** | Already integrated; roles via metadata; **Organizations** later for program operators. |
| **Hosting** | **Vercel** (app) + **Neon** (db) + **Cloudflare R2** (media) | Vercel is Next-native (edge, ISR, preview deploys); Neon serverless scales to zero; R2 has no egress fees. |
| **Search** | **Postgres FTS (MVP) → Typesense (V2)** | Start free/simple; Typesense adds instant faceted + typo-tolerant + vector search, self-hostable, cheaper than Algolia, simpler than Elasticsearch. |
| **Image storage** | **Cloudflare R2** via presigned uploads + **next/image** | S3-compatible, cheap, no egress; keeps the existing `lib/storage.ts` swap seam. |
| **Video** | R2 (MVP) → **Mux** or **Cloudflare Stream** (V2) | Adaptive streaming, thumbnails, moderation hooks at scale. |
| **AI** | **Anthropic Claude API** (see §12) + **Voyage AI** embeddings | Best-in-class reasoning for explanations/assistants; Voyage for embeddings (Anthropic's recommended embeddings partner) → pgvector. |
| **CMS** | **The app is the CMS** (admin + moderation) for structured data; **MDX** (or Sanity at V2) for editorial | Program data is relational and drives matching/search — it belongs in Postgres, not a headless CMS. Use MDX/CMS only for long-form guides. |
| **Analytics + flags** | **PostHog** | Product analytics, funnels, session replay, **feature flags** (doubles as the AI on/off + gradual-rollout switch). |
| **SEO** | Next SSR/SSG + JSON-LD + sitemap | See §14 below. |
| **Email/notify** | **Resend** | Review-approved, question-answered, deadline reminders. |
| **Error/observability** | **Sentry** | Frontend + API error tracking. |

---

## 9. Search & Filtering Architecture

**MVP (Postgres):**
- Keyword: `tsvector` over (name, organization, description, tag names) + `pg_trgm` for fuzzy/partial.
- Structured filters: Tier-1 columns (type, affiliation, gender, cost range, duration, deadline, languages, academicCredit, hasOverseasProgram).
- Facet filters: join `ProgramFacetValue` with a generic grammar (`facet.<key>_min/_max/_eq`). Precompute `facetsCache` for display; query the normalized table for filtering.
- Sort: relevance, rating, cost, deadline, "best match" (if a quiz vector is present).

**V2 (Typesense):**
- Index the normalized program DTO (Tier-1 + flattened facets + tags + locations).
- Instant search-as-you-type, typo tolerance, synonyms ("gap year" ↔ "shana"), faceted counts.
- **Vector field** (embeddings) for **semantic / natural-language search** and "programs like this."

**Natural-language search (AI, dormant → on):** `/api/ai/search` sends the query + facet schema to Claude, which returns a **structured filter object** the existing search executes. Fallback when AI off: keyword search. This keeps NL search a thin, swappable layer over deterministic search.

---

## 10. Security Considerations

- **AuthN/Z:** Clerk sessions; server-side role checks on every mutation (`requireRole`, `requireSignedIn` already exist). Never trust client role. Re-check auth inside Server Actions (a proxy/matcher gap must not bypass it).
- **Input validation:** Zod at every API boundary; strict enums; length caps; URL/email validation (already applied to program input).
- **File uploads:** validate MIME + size (already done); store off the app origin (R2); generate random keys; never execute; scan videos (ClamAV/Mux) at scale; strip EXIF from images.
- **Moderation as a safety layer:** all public content (programs, edits, reviews, alumni text) passes `PENDING → approved`. Prevents spam/defamation going live.
- **Rate limiting:** on submissions, reviews, quiz, alumni questions, AI endpoints (per-user + per-IP) via Upstash Redis or Vercel middleware.
- **PII minimization:** alumni profiles are opt-in and user-controlled; contact happens in-app (no email harvesting); reviews are tied to accounts (not anonymous) but display name only.
- **AI safety:** never send secrets/PII to the model; treat model output as untrusted (validate structured outputs with Zod; the NL-search filter object is schema-checked before executing); prompt-injection hygiene on any user-supplied text passed to the model; log + cap token spend.
- **Secrets:** server-only env (`CLERK_SECRET_KEY`, DB URL, `ANTHROPIC_API_KEY`); never in `NEXT_PUBLIC_*`; rotate; `.env*` gitignored (already).
- **Abuse/defamation:** report-a-review flow; operators can flag (moderated) responses; retain edit history for disputes.
- **Headers:** CSP, HSTS, `X-Content-Type-Options`, referrer policy via Next config.

---

## 11. Scalability Plan

- **Reads dominate.** Cache aggressively: ISR/SSG for program profiles and browse (revalidate on publish via tag-based revalidation); `facetsCache` avoids N joins per page; CDN for media.
- **DB:** Neon autoscaling + read replicas later; proper indexes (status, affiliation, cost range, facet definition+value); paginate everything (cursor-based).
- **Search offload:** move heavy faceted/semantic search to Typesense so Postgres handles transactions, not fan-out queries.
- **Media:** R2 + image CDN (next/image) + streaming provider for video → app servers never proxy large files.
- **Background work:** queue (Inngest/Upstash QStom) for facetsCache recompute, review-summary generation, embeddings, email, Typesense sync — keep request path fast.
- **AI cost/scale:** cache AI outputs (review summaries per program version; NL-search results per normalized query); use cheapest capable model per task (Haiku for high-volume); batch offline jobs; hard token budgets.
- **Statelessness:** app servers stateless (Clerk sessions, DB/Redis for state) → horizontal scale on Vercel.

---

## 12. AI Integration — designed now, dormant until you flip the switch

**Requirement:** *"For the start don't have anything AI-powered, but already have the code in place to activate on my command."*

### 12.1 Architecture: provider abstraction + feature flags + deterministic fallbacks
```
lib/ai/
  index.ts          // getAIProvider(): reads AI_ENABLED + PostHog flag
  types.ts          // AIProvider interface (all capabilities)
  null-provider.ts  // DEFAULT: deterministic, no network. Real fallbacks.
  anthropic.ts      // Claude-backed implementation (used only when enabled)
  prompts/          // versioned prompt templates
```
```ts
export interface AIProvider {
  parseSearch(q: string, schema: FacetSchema): Promise<StructuredQuery>;
  explainMatch(profile: QuizWeights, program: ProgramDTO): Promise<string[]>;
  summarizeReviews(reviews: Review[]): Promise<ReviewSummary>;
  assistant(messages: ChatMsg[], context: AssistantContext): Promise<ChatMsg>;
}
```
- **`AI_ENABLED=false` by default.** `getAIProvider()` returns `NullProvider`, which produces *deterministic* results: `parseSearch` → keyword filter; `explainMatch` → templated reason bullets from the scoring engine; `summarizeReviews` → top-rated snippets + rating math; `assistant` → a guided, rules-based responder ("here are the 3 filters that matter for that").
- **Every AI surface ships behind this interface from MVP.** UI, API routes, and DB fields (e.g. `Program.reviewSummary`, `QuizResponse.results[].reasons`) exist and are populated by the Null provider. **Flipping `AI_ENABLED=true` (or a PostHog flag for gradual rollout) swaps in `AnthropicProvider` with zero UI/contract changes.**
- **Structured outputs are Zod-validated** regardless of provider, so the app never trusts raw model text (NL-search filters, match reasons, summaries all conform to a schema).

### 12.2 Capabilities (each: Null fallback → Claude upgrade)
1. **Personalized recommendations** — deterministic weighted match now; Claude re-ranks/justifies later.
2. **Natural-language search** — keyword now; Claude → structured filter object later.
3. **Review summarization** — extractive snippets now; Claude abstractive digest ("Alumni consistently praise X; some note Y") later.
4. **Program-comparison assistant** — static compare table now; Claude Q&A over the table ("which is better for a shy, academic student on a budget?") later.
5. **Travel-planning assistant / Aliyah-planning assistant** — linked resources now; Claude conversational planners later.
6. **Conversational onboarding** — the deterministic quiz now; Claude free-text intake ("tell me about yourself") mapping to the same facet weights later.

### 12.3 Recommended models (Anthropic Claude)
- **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) — high-volume, latency-sensitive, cheap: NL-search parsing, review summarization, auto-tagging.
- **Claude Sonnet 5** (`claude-sonnet-5`) — reasoning-heavy: match explanations, comparison assistant, conversational onboarding/planning.
- **Claude Opus 4.8** (`claude-opus-4-8`) — offline/batch quality passes (e.g. editorial drafting, hardest planning questions).
- **Embeddings:** Voyage AI (Anthropic's recommended partner) → store vectors in **pgvector** for semantic search / "similar programs." (Anthropic doesn't provide an embeddings endpoint.)
- Use Claude **tool use / structured outputs** so the model returns schema-conformant JSON; **prompt caching** for the large facet-schema/system prompts to cut cost.

*(Before implementing, consult the `claude-api` skill for current model IDs, pricing, and the tool-use/structured-output API.)*

---

## 13. Admin Dashboard Design

Extend the existing `/admin`:
- **Queue** — tabs: Pending Programs · Pending Edits (with field-level diff) · Pending Reviews · Correction Reports. Approve/Reject inline (built).
- **Facet Editor** — per program, a grouped form generated from `FacetDefinition` (0–5 sliders, enum dropdowns, booleans, short text). Saving recomputes `facetsCache` + `aliyahPrepScore`.
- **Rubric Manager** — CRUD on `FacetGroup`/`FacetDefinition` (add a new rating dimension without a migration), set `matchWeightDefault`.
- **Data Health** — programs missing core facets, stale deadlines, broken links, low review counts; completion % per program; bulk actions.
- **Taxonomy** — tags merge/rename; synonym management (feeds search).
- **Users & Roles** — promote moderators/admins (built); audit log of moderation actions.
- **AI Console (V2)** — toggle `AI_ENABLED`, per-feature flags, view cached AI outputs, re-run summaries, token-spend dashboard.

---

## 14. SEO Strategy

- **SSR/SSG** every program profile and guide; ISR revalidation on publish.
- **Structured data (JSON-LD):** `Course`/`EducationalOccupationalProgram` + `Organization` + `AggregateRating` per program → rich results.
- **Programmatic SEO:** category and combination landing pages ("Gap year yeshivot in Jerusalem", "Summer programs under $8,000") generated from facets.
- **Editorial guides** target high-intent queries ("gap year vs. seminary", "how to choose a yeshiva", "Aliyah after gap year") → internal links to programs.
- Per-page metadata + OpenGraph/Twitter cards (program logo), canonical URLs, `sitemap.xml`, `robots.txt`, fast Core Web Vitals (server components, image optimization).

---

## 15. Future Vision — the broader ecosystem

Design the schema and IA so "Program" is one node in a larger **"connect Jews with Israel"** graph. Reuse the facet/rubric, review, and matching engines for new verticals:
- **Aliyah resources** (Nefesh B'Nefesh-style guides, checklists, the Aliyah-planning assistant).
- **Community matching** (find a community/city by lifestyle + religious fit — same matching engine).
- **Schools & universities** (Israeli higher-ed directory — reuse program facets).
- **Jobs & housing** (post-program landing — partner listings).
- **Volunteer opportunities & IDF prep** (Garin Tzabar, Mahal — already adjacent).
- **Jewish organizations & mentorship** (alumni network → mentor network).

The through-line: a trusted, structured, comparison-first, personalized decision layer for major Jewish life decisions connected to Israel. Everything in §3's schema (facets, reviews, matching, saved items) generalizes to these verticals — build them as new `entityType`s over the same primitives rather than new apps.

---

## 16. Additional high-value features (beyond the brief)

- **Deadline tracker + reminders** (Resend email/calendar `.ics`) — huge for parents/applicants.
- **Scholarship & grant database** (RootOne, Masa, program-specific) cross-linked to programs.
- **"Programs like this"** (semantic similarity) on every profile.
- **Verified-attendance reviews** (program-issued codes) to raise trust further.
- **Cost-of-attendance calculator** (program fee + flights + spending + grants → net).
- **Side-by-side "my quiz result vs. this program"** delta on each profile.
- **Advisor mode** — counselors build & share short-lists with students.
- **Data provenance badges** — "verified by program", "sourced from official site (date)", "community-reported" — visible trust signals.
- **Change history** on every program (public "last updated / what changed").

---

## 17. Recommended immediate next steps (execution order)

1. **Postgres migration** (Neon) — swap Prisma datasource + adapter; move `researched-programs.json` importer to seed. *(Blocks most below.)*
2. **Schema expansion** — Tier-1 fields + facet rubric + `facetsCache`; migrate existing 5 seed programs.
3. **Rubric seed** — the six FacetGroups and their definitions (§3.3).
4. **Import researched programs** — dedupe by slug, map to Tier-1 + partial facets, mark `PUBLISHED`.
5. **Faceted browse/search** (Postgres) + generic filter grammar.
6. **Program profile facet tabs + Honest Fit**; **Comparison tool**.
7. **Matching quiz v1** (deterministic) + reasons.
8. **Aliyah Prep Score** formula + gauge.
9. **AI abstraction layer** with `NullProvider` wired into search/quiz/reviews (dormant).
10. **Admin facet editor + data-health**.
> Then V2: Typesense, alumni network, flip AI on, operator accounts, editorial/SEO.

---

### Appendix A — Deterministic matching engine (v1, no AI)
```
prefs = quizAnswers → weighted vector over FacetDefinitions (+ hard filters: budget, gender, affiliation)
for each PUBLISHED program passing hard filters:
    score = Σ_facet  weight(facet) * agreement(pref[facet], program.facet[facet])
    reasons = top contributing facets where program meets/exceeds preference
rank by score; return top N with reasons[]
```
`agreement()` = closeness on 0–5 scales, equality on enums/booleans. Weights come from `FacetDefinition.matchWeightDefault`, overridable per quiz answer. This is fully explainable and AI-free; `explainMatch()` later rewrites `reasons` into prose.

### Appendix B — Aliyah Prep Score (v1)
Weighted average (0–100) of the **Aliyah** facet group (Hebrew, bureaucracy, employment, housing, Israeli culture, community integration, long-term support), each 0–5, normalized ×20, weighted, rounded. Deterministic and transparent (show the breakdown on the profile). AI can later tune weights from outcome data.
