# Israel Programs Wiki — Brand & Visual Style Guide

Version 1.0 · July 2026

Purpose: This document is the single source of truth for the visual system.
Implementation agents (Claude Code) should treat it as a spec, not a suggestion. Where
this document and existing code disagree, this document wins.

## 0. What this product is

A free, unaffiliated reference directory of Israel-based programs — yeshivot,
seminaries, mechinot, gap-year tracks, summer programs, internships — for Jewish young
adults abroad and their parents, with alumni ratings and references attached to each
entry.

It is a reference work, not a startup landing page. Every design decision below follows
from that. The nearest cousins are a field guide, a course catalogue, an encyclopedia
entry — not a SaaS marketing site.

Two audiences, both on phones:

- 17–19 year olds comparing options, often arriving from a WhatsApp link
- Parents doing due diligence, who need the site to look credible and legible

The single job of every page: help someone compare programs honestly and quickly.

## 1. Non-negotiable rules

These exist to kill the generic-AI-template look. Violating any one of them is a bug.

1. No box shadows. Separation comes from 1px rules and background tints. Not one
   `shadow-sm`, `shadow-md`, or `shadow-lg` anywhere in the app.
2. Border radius is 4px. Full stop. No `rounded-xl`, no `rounded-2xl`, no
   `rounded-full` except on avatars and the toggle knob.
3. No gradients. Not in heroes, not in buttons, not in backgrounds.
4. No emoji as icons. Ever. Use Lucide icons at 16px/20px, `stroke-width: 1.5`.
5. No purple, indigo, or violet. Not in a single class name.
6. No Inter. See §3.
7. Every accent use must be justified. Brass is a highlight, not a theme. If more
   than ~5% of a screen is brass, cut it back.
8. Light background. The app is a light-surface reading product. Navy is chrome
   (header/footer/section bands), not the page.
9. Typographic punctuation. Em dashes (—), not `--`. Curly quotes. Non-breaking space
   before Hebrew-transliterated names where it prevents an orphan.
10. Text is never clipped. No fixed-height containers around text that can wrap. See §8.

## 2. Color

Six values. Nothing outside this list ships.

| Token | Hex | Role |
|---|---|---|
| ink-navy | `#16274A` | Header, footer, section bands, primary button fill |
| paper | `#FBFAF7` | Page background |
| surface | `#FFFFFF` | Cards, entry bodies, form fields |
| stone | `#E4E0D6` | Rules, dividers, table stripes, disabled states, tag backgrounds |
| brass | `#B8912F` | Accent — rating fills, active tab underline, link hover, hairline under entry headers |
| cypress | `#3F5D4A` | Secondary — category/type tags, "verified" states |

Text colors (derived, not new brand colors):

| Token | Hex | Use |
|---|---|---|
| text-primary | `#1A1A17` | Body and headings on paper/surface |
| text-muted | `#5B5A54` | Captions, metadata strips, helper text |
| text-inverse | `#F4F2ED` | Text on ink-navy |

Reserved, not brand colors:

- `clay` `#A6402F` — destructive actions and errors only. Never decorative.
- `cypress` doubles as success. Do not introduce a separate green.

Contrast floor: every text/background pair must clear 4.5:1, and interactive controls
must clear 3:1 against their surroundings. This is a hard gate — see §8, where the
current build fails it.

Brass on white is 3.6:1 — it fails for body text. Brass may be used for: fills, rules,
underlines, icon strokes at 20px+, and text at 18px+ bold only. Never for small text or
muted labels.

## 3. Typography

### Display — Frank Ruhl Libre

Headings, program names, entry titles, the wordmark.

Chosen deliberately: Frank Ruhl is the historic Hebrew book face, and Frank Ruhl Libre
ships Hebrew and Latin in one family. A directory of Israeli institutions is full of
Hebrew names — this handles them natively instead of falling back to a mismatched
second font mid-sentence. It is also not a face anyone reaches for by default, which is
the point.

Weights: 400, 500, 700. Load only these.

### Body & UI — IBM Plex Sans

All body copy, buttons, form labels, navigation, helper text. Pair with IBM Plex Sans
Hebrew for Hebrew UI strings.

Chosen because it has actual character in its terminals and aperture, reads well at
14–16px on a phone, and has a real Hebrew companion. It is specifically not Inter,
which is the single loudest tell that a site was generated rather than designed.

Weights: 400, 500, 600. Load only these.

### Data — IBM Plex Mono

Response counts, rating numbers, program IDs, metadata strips. 400 and 500 only. Use
tabular figures (`font-variant-numeric: tabular-nums`) anywhere numbers stack or
update.

### Scale (mobile-first, 1.2 ratio)

| Token | Size / line-height | Face | Use |
|---|---|---|---|
| display | 30px / 1.15 | Frank Ruhl Libre 700 | Page H1, program name |
| h2 | 22px / 1.25 | Frank Ruhl Libre 500 | Section headings |
| h3 | 18px / 1.3 | IBM Plex Sans 600 | Question text, subsection |
| body | 16px / 1.55 | IBM Plex Sans 400 | Default |
| small | 14px / 1.5 | IBM Plex Sans 400 | Helper text, captions |
| meta | 12px / 1.4, +0.06em tracking, uppercase | IBM Plex Mono 500 | Metadata strips, labels |

Desktop: bump display to 42px and h2 to 28px. Everything else stays.

Measure: reading columns cap at 68ch. Listing/table views cap at 1120px.

Never letterspace body text. Never center a paragraph longer than one line.

## 4. Space and structure

Base unit 4px. Permitted values only: 4, 8, 12, 16, 24, 32, 48, 64.

Vertical rhythm within a page:

- Label → its control: 8
- Control → next control: 16
- Question → next question: 32
- Section → next section: 48, separated by a 1px stone rule

Page gutters: 16 on mobile, 24 at ≥640px, 32 at ≥1024px.

Structure carries information, it does not decorate. No numbered 01 / 02 / 03 markers
unless the content is genuinely sequential. No decorative dividers between things that
aren't separate. No icon next to a label that the label already explains.

## 5. The signature: the entry header

This is the one memorable element. It appears at the top of every program page and
every poll, and it is what makes the site read as a reference work.

Rules:

1. The Hebrew name sits directly beneath the Latin one, same family, lighter weight,
   muted. If no Hebrew name exists in the data, the line is omitted — never a
   placeholder.
2. The metadata strip is a single line of mono uppercase separated by `·`. It wraps as
   a block, never breaks mid-item. Max four items; pick the four most differentiating.
3. The brass hairline is 2px, full-bleed to the content gutter, and is the only place
   brass appears above the fold.
4. The accent rule goes under the header, not beside the heading. The vertical gold
   bar to the left of the H1 that overlaps the first letter is a bug — see §8.1.

Spend the boldness here. Everything else on the page stays quiet.

## 6. Components

### Buttons

| Variant | Fill | Text | Border |
|---|---|---|---|
| Primary | ink-navy | text-inverse | none |
| Secondary | surface | ink-navy | 1px stone |
| Ghost | transparent | ink-navy | none, underline on hover |
| Destructive | surface | clay | 1px clay |

Height 44px minimum (touch target). Radius 4px. Padding 12 / 20. Label is a verb
phrase in sentence case describing exactly what happens: "Submit ratings", not
"Submit". The same verb persists into the confirmation: "Submit ratings" →
"Ratings submitted".

### Choice chips (the recommend / expectation scales)

Currently these render as five separate pill buttons that wrap awkwardly onto two
lines with an orphan. Replace with a single segmented control: one row, 5 equal
segments, 1px stone border, dividers between segments, selected segment fills
ink-navy with text-inverse.

On screens under 380px it stacks to a vertical list of full-width rows, each 44px,
selected row filled. It does not wrap into ragged pill rows.

### Rating input — replace the stars

Five near-black stars on a dark field are effectively invisible (§8.4), and the star
row is the single most generic control in the app. Replace with a numbered 1–5
segmented scale:

- 44px tall, equal segments, stone border, mono numerals.
- Selected segment: brass fill, `#1A1A17` text (brass on dark text clears contrast
  comfortably).
- Anchor labels beneath at small, text-muted, left and right only.
- Unanswered state shows nothing extra. Delete the "Not answered" label — an
  unselected control is self-evidently unanswered, and the label reads as an
  accusation.

### Rating display (results)

Not stars. A number and a bar: number in IBM Plex Mono 500 at 22px, bar 6px tall in
brass on stone, count in meta.

### Tags

Background stone, text text-primary at small. Program-type tags use cypress
background at 12% with cypress text. Radius 4px, padding 4 / 8. No borders, no icons.

### Form fields

Border 1px stone, radius 4px, background surface, padding 12, min-height 44px. Focus:
2px ink-navy outline with 2px offset — visible, never removed. Textareas auto-grow
from 3 rows; they are never fixed-height (§8.2).

### Motion

Almost none. Transitions on color and border only, 120ms ease-out. No scroll reveals,
no fade-ins, no staggered entrances — they are a primary reason a site reads as
generated. Respect `prefers-reduced-motion` by disabling all transitions.

## 7. Voice

- Sentence case everywhere. Headings, buttons, labels, tags.
- Plain and specific over clever. "Five questions, about a minute" beats "Quick and
  easy!"
- Second person, active voice. "You can skip any question" not "Questions may be
  skipped."
- Errors say what happened and what to do. No apologies, no vagueness: "That email
  address isn't valid. Check it, or leave the field empty to skip."
- Empty states are an invitation. "Be the first to rate this program" not "No data
  available."
- One job per element. A label labels. Helper text explains. Placeholder text
  demonstrates a format — it does not carry policy. Legal and privacy language lives
  in visible helper text under the field, never inside a placeholder (§8.2).
- Never repeat the same string twice on one screen. The poll used to repeat an
  identical 20-word placeholder under every question. Say it once, at the top.

## 8. Bugs in the current build, with fixes

These were visible in the live mobile poll page and were not fixable by tokens alone.
Each was its own task.

**8.1 — The heading accent bar overlaps the H1.** The vertical gold rule sits on top
of the first letter of the program name. Remove the left-side vertical bar entirely
and replace it with the 2px brass hairline below the header block, per §5.

**8.2 — Free-text placeholders are clipped.** A placeholder describing moderation was
cut off mid-word by a short fixed-row-count container. Fixes, all required:

- Shorten the placeholder to "Optional — add a sentence or two."
- Move the moderation notice to a single line of helper text at the top of the form,
  stated once.
- Remove the fixed height; textarea starts at 3 rows and auto-grows.

**8.3 — The N/A checkbox is overlapped by the textarea above it.** Layout/stacking
bug. Each question is a single flow container with 32px bottom margin; nothing inside
it is absolutely positioned.

**8.4 — Star rating fails contrast catastrophically.** Dark gray stars on a
near-black background are close to invisible on a phone in daylight. Superseded by the
light theme plus the numbered scale in §6. This one was costing real poll
completions — the highest-priority item in this list.

**8.5 — `--` instead of an em dash** in page copy. Sweep the whole codebase and the
database description fields for `--` used as an em dash, and straight quotes.

**8.6 — Header contrast.** Wordmark and hamburger on ink-navy need text-inverse, not
pure white at low opacity.

## 9. Implementation order

Do not do this as one pass.

1. **Tokens first.** Define the palette, type, spacing, and radius scales in the
   Tailwind config / CSS variables. Do not touch components. Verify the app still
   builds.
2. **Global sweep.** Remove all shadows, all radii above 4px, all gradients, all emoji
   icons, all indigo/violet/purple classes. Swap fonts. This alone will change the
   site's character more than anything else on the list.
3. **Poll page.** Fix §8.1–8.5 and rebuild the rating input and choice chips per §6.
   This is the page alumni actually see, and it is the current bottleneck.
4. **Program page.** Entry header (§5), rating display, tags.
5. **Home and listings.** Last.

After each step: screenshot at 390px width and check it against §1. If any of the ten
rules is violated, the step isn't done.

## 10. Assumptions to confirm

These were inferred rather than given when this guide was first implemented, and were
worth a sanity check before step 1:

- The site is currently Tailwind (with or without shadcn). If shadcn, the component
  defaults for radius and shadow need overriding at the config level, not
  per-component.
- Moving from the current dark theme to a light theme was the biggest single call in
  this document. The reasoning: it's a reading and comparison product with parents in
  the audience, the dark theme is where the contrast failures originated, and
  dark-with-one-accent is itself a generated-design cliché.
- Frank Ruhl Libre and IBM Plex both load from Google Fonts with Hebrew subsets. Confirm
  the Hebrew subset is actually included in the font loader, or Hebrew program names
  will fall back to a system face and look worse than before.
