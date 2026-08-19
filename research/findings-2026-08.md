# Research findings — August 2026 batch

Primary-source research for the programs named in the task. **Nothing below has been
written to the database or any `data/` file yet** — this is the approval gate. Every
filled field lists its source URL; every blank field is blank because no primary source
confirmed it (never guessed). English + Hebrew name given for each. `contactEmail` is
never written by import code regardless of what's found (owned exclusively by the
contact-verification workflow) — where a general office/program email was found, it's
noted here for the record only; it will land in `data/ignored-import-emails-*.json`
automatically if included in the import batch, for later routing through that workflow.

---

## 1. Already in the directory — enrich only

### Yeshivat Shavei Chevron (ישיבת שבי חברון) — `yeshivat-shavy-hebron`
Thinnest row in the set: no website, phone, or organization on file today.

| Field | Value | Source | Confidence |
|---|---|---|---|
| contactWebsite | `https://shaveihevron.org/` | [shaveihevron.org](https://shaveihevron.org/) | High — official site, live |
| contactPhone | `02-996-3777` | [Contact page](https://shaveihevron.org/צור-קשר/) | High |
| (office email, not written) | `office@shevron.org` | same contact page | High — general office address, not a personal one |
| organization | *left blank* | — | No separate parent-org name found beyond the yeshiva itself |
| durationText, cost | *left blank* | — | Not stated on site |

No change to existing description/goodFor/tags — those are already populated and not
contradicted by anything found.

### Yeshivat Har Shalom (ישיבת הר שלום) — `yeshivat-har-shalom-mitzpe-ashtamoa`
**Resolution of the Neta Yeminecha ambiguity (see §2) also clarified this one.** I
initially suspected a 2023 relocation to Chomesh based on a Hebrew Wikipedia article
titled "ישיבת חומש" — but that article's rosh yeshiva (Rabbi Elishama Cohen) does not
match this yeshiva's actual rosh yeshiva per its own hesder-council listing (Rabbi Itzik
Idles / Rabbi Itzik Amti). **These are two different institutions that happen to share
early history at the Chomesh site pre-2005** — "Yeshivat Chomesh" is a separate,
newer higher yeshiva re-established at Chomesh in 2023, unrelated to Har Shalom beyond
that shared origin point. Flagging this explicitly so it isn't "fixed" by a future pass
based on the Wikipedia article alone.

| Field | Value | Source | Confidence |
|---|---|---|---|
| nameHe | ישיבת הר שלום | [hesder.org.il listing](https://hesder.org.il/institute/ישיבת-הר-שלום-חומש) (already the on-file signupUrl) | High |
| location | *no change* — Mitzpe Ashtamoa confirmed still current | same source, fetched fresh: "the yeshiva is currently located in Ashtmua... in southern Har Hebron" | High — directly contradicts the Wikipedia-based relocation theory |
| Rosh Yeshiva (context only, not a Program field) | Rabbi Itzik Idles, with Rabbi Itzik Amti | same source | High |

**Recommendation: no location change**, just add `nameHe`. adminNote already on file
("no independent yeshiva-run website was found...") stays accurate and doesn't need editing.

### Mechinat Shuvu Achim (מכינת שובו אחים) — `mechinat-shuvu-achim`
| Field | Value | Source | Confidence |
|---|---|---|---|
| contactPhone | `08-9170727` (main office, not a personal cell) | [mechinot.org.il council listing](https://mechinot.org.il/mechina/toraniyot-joint/2021-09-29-09-06-04) | High — official pre-military-academy council directory |
| durationText | *left blank* | checked both shuvuahim.site123.me and the mechinot.org.il listing | Neither source states an explicit total length; site references "שנה ב׳" (year 2) students implying a multi-year structure but never states the standard track length outright — leaving blank rather than assuming the typical 1-year mechina norm |

**Freshness check**: mechinot.org.il (the official council directory) currently lists
this mechina and a separate news item (Aug 2026, inn.co.il) describes it "opening with
new leadership, a renovated campus" for the coming year — actively maintained, not stale.

### Yeshivat Har Bracha, Mechinat Yemin Orde — spot-checked only
Both already well-filled (contactWebsite, contactPhone, durationText, nameHe all
present). Spot-checked against their live sites — no discrepancies found, no changes
proposed.

### Kiryat Gat — no action needed
Both plausible institutions (`yeshivat-derech-chaim-kiryat-gat`,
`yeshivat-haseder-gavoha-kiryat-gat`) are already listed and well-filled. Reported per
your instruction; nothing to do.

---

## 2. New programs

### Yeshivat Or Torah Mahanaim (ישיבת אור תורה מחנים) — new
Hesder yeshiva at Migdal Oz, Gush Etzion, part of Ohr Torah Stone. Confirmed missing
from the catalog.

| Field | Value | Source | Confidence |
|---|---|---|---|
| name | Yeshivat Or Torah Machanaim | [machanaim.org.il](https://www.machanaim.org.il/) | High |
| nameHe | ישיבת אור תורה מחנים | same | High |
| location | Migdal Oz, Gush Etzion, Israel | same (org is part of OTS network, campus at Migdal Oz) | High |
| contactPhone | `02-5880906` | same | High |
| contactWebsite | `https://www.machanaim.org.il/` | same | High |
| (office email, not written) | `machanaim@ots.org.il` | same | High — note: `@ots.org.il` domain, shared across many Ohr Torah Stone programs. **Flagging, not deciding**: this may be an Organization-model candidate (umbrella OTS contact) rather than a program-owned address — see CLAUDE.md's Organization-model rule. Not acting on this without your call. |
| description | Hesder yeshiva combining "Torah, World, Tikkun" — deep textual study aimed at real-world relevance, alongside Halacha Kollel and a Diaspora rabbinical-training kollel | same | High |
| durationType | `MULTI_YEAR` | inferred from hesder-yeshiva category (same pattern as every other hesder yeshiva already in the catalog) | High — categorical, not a guessed number |
| durationText | *left blank* | not explicitly stated on site | — |
| cost, signupUrl | *left blank* | not found | — |
| tags | `hesder`, `yeshiva`, `Gap year (post-high school)`, `Boys only`, `High integration`, `Religious Zionism/Modern Orthodox`, `Spiritual growth`, `Pre-military`, `Israeli yeshiva` | matches the exact tag set used by every other hesder yeshiva already in the catalog (Yeshivat Hesder Sderot, Maalot Yaakov, Akko, etc.) — no new tags | High — all pre-existing tag values, no minting |

### Yeshivat Eshtamoa (ישיבת אשתמוע) — new — resolves the "Neta Yadicha" ambiguity
**This is a real, separate institution from Yeshivat Har Shalom**, not the same one
under a different name. n-yeminecha.org (the site whose secretariat email initially
raised the ambiguity) is Yeshivat Eshtamoa's own site — a distinct agricultural higher
yeshiva, different rosh yeshiva, different institutional character (agricultural yeshiva
gevoha, not hesder). The shared `harshalom1@gmail.com` admin contact is most plausibly a
holdover from a prior campus/admin relationship, not evidence they're one institution.

| Field | Value | Source | Confidence |
|---|---|---|---|
| name | Yeshivat Eshtamoa | [n-yeminecha.org](https://n-yeminecha.org/) | High |
| nameHe | ישיבת אשתמוע – ישיבה חקלאית | same | High |
| location | Mitzpe Eshtamoa, southern Mount Hebron, Israel | same | High |
| description | Agricultural higher yeshiva and beit midrash ("ישיבה גבוהה ובית מדרש חקלאי"), led by Rabbi Betzalel HaGer | same | High |
| contactWebsite | `https://n-yeminecha.org/` | same | High |
| (office/director contacts, not written) | Director Shmuel Ashoush 058-589-0777 / mankal.hs@gmail.com; office 055-994-3776 / harshalom1@gmail.com | same | High |
| tags | `yeshiva`, `Boys only` | confident, directly stated | High |
| tags (uncertain — flagging rather than guessing) | age bracket, affiliation, "agriculture"-style tag | — | **Not assigned.** Nothing on the site states whether this serves gap-year-age students, hesder-eligible students, or a mixed/older population typical of some agricultural yeshivot gevohot — leaving age/affiliation tags off rather than guess. Recommend an admin who knows this institution's actual student profile fill these in post-import. |
| durationType | `MULTI_YEAR` (placeholder — see tag note above) | — | Low — flagging for your review rather than asserting |

**Freshness**: newest dated content on the site is from **December 2024 (~20 months
old** as of today). Under your 2-year staleness threshold, so I'm not flagging it as
dead — but it's the most dated of anything in this batch, worth a mention.

### Program page split: Midreshet Lindenbaum

Confirmed via direct fetch of both pages that **"Hadas" and "Hadas Chu"l" are two
genuinely different tracks**, not one program under two names:

- `lind.org.il/תכנית-הדס-חול/` — explicitly **for "orthodox, post-high-school young
  women from abroad"** preparing for IDF service as Machal volunteers or new immigrants.
  This is the overseas track.
- `lind.org.il/תכנית-הדס/` — the **flagship Israeli program**, for Israeli high-school
  graduates, integrating a year of study with 3 years of IDF service (Education Corps,
  Intelligence, or Air Force roles). No mention of overseas students at all.

**Recommendation, per your approved plan: existing slug `midreshet-lindenbaum` stays
the overseas program** — its current data (durationText "1 year (options for 6-month or
2.5-month tracks)", `signupUrl: applytosem.org`, goodFor referencing "overseas
post-high-school students", `overseas-program` tag) already matches the Chu"l track, not
the Israeli one. A new row is created for the Israeli Hadas track.

#### Existing row `midreshet-lindenbaum` — proposed field updates (overseas/Chu"l track)
| Field | Current | Proposed | Source | Confidence |
|---|---|---|---|---|
| durationText | "1 year (options for 6-month or 2.5-month tracks)" | "6 months (Midrashit, Aug–Nov), 11 months (Hadas Chu\"l), or 18 months (Machal option)" | [lind.org.il Hadas Chu"l page](https://www.lind.org.il/תכנית-הדס-חול/) | High |
| contactPhone | `+972-2-6710043` | *no change* | matches | — |
| contactWebsite | `midreshet-lindenbaum.org.il` | *no change* — confirmed still live, describes both Israeli and overseas tracks from one umbrella site | fetched fresh, live | High |
| adminNote | *(none)* | "Split from a single combined entry in Aug 2026 — this row is specifically the Hadas Chu\"l / overseas track (applytosem.org signup); see the separate 'Midreshet Lindenbaum — Hadas' entry for the Israeli program. Coordinator: Ariel Hurwich Braun, ariel@ots.org.il, +972-54-5814783 (not written to contactEmail)." | — | — |

#### New row: Midreshet Lindenbaum — Hadas (תכנית הדס, Israeli track)
Fresh slug (e.g. `midreshet-lindenbaum-hadas`), per your approved split.

| Field | Value | Source | Confidence |
|---|---|---|---|
| name | Midreshet Lindenbaum — Hadas | [lind.org.il/תכנית-הדס](https://www.lind.org.il/תכנית-הדס/) | High |
| nameHe | תכנית הדס ע"ש משפחת פאווה | same | High |
| location | Leib Yaffe 51, Jerusalem | same (same building as the overseas program) | High |
| description | Flagship program combining a year of deep Torah study (Tanach, Talmud, Halacha, Jewish thought) with 3 years of IDF service in the Education Corps, Intelligence Corps, or Air Force — includes biweekly in-person support sessions at 15 military bases during service and Jerusalem-area housing for those stationed nearby | same | High |
| durationText | "1 year at the midrasha (Elul–Tammuz) + 3 years IDF service" | same | High |
| contactPhone | `02-6710043` | same | High |
| contactWebsite | `https://www.lind.org.il/תכנית-הדס/` | same | High |
| (office email, not written) | `mlisrael@ots.org.il` | same | High |
| organization | Midreshet Lindenbaum (OU Israel / Ohr Torah Stone network) | matches existing sibling row | High |
| tags | `Girls only`, `jerusalem`, `Gap year (post-high school)`, `High integration`, `Religious Zionism/Modern Orthodox`, `Spiritual growth`, `Pre-military` | matches the closest existing analog (`midreshet-adraba` — Girls only + Pre-military + Jerusalem midrasha), upgraded to `High integration` given the full 3-year active-duty IDF service (vs. adraba's lighter pre-military prep) | High — all pre-existing tag values |
| adminNote | "Split from the combined `midreshet-lindenbaum` entry in Aug 2026 — see that row's adminNote for the overseas/Chu\"l counterpart." | — | — |

**Inbound-link risk: confirmed none in code** (verified in the planning phase — no
route/component/config references any Lindenbaum slug; only a program *name* appears in
a `lib/programSearch.test.ts` fixture, which is name-based, not slug-based, so unaffected
either way). Two historical one-shot data files (`good-for.json`,
`integration-age-research.json`) are slug-keyed to `midreshet-lindenbaum` and would
silently no-op if ever re-run — not a live concern since neither is part of any script
run going forward, but noted for completeness.

---

## 3. Conditional / dropped, as approved

| Item | Outcome | Reason |
|---|---|---|
| **Mechinat Or Lod** (מכינה קדם-צבאית "אור" לוד) | **Dropped** | Two separate WebSearch passes (this session and the prior one) found only an Instagram presence — no official site, and absent from the mechinot.org.il council directory. Per your approved conditional ("add only if I find a real site"), this doesn't clear the bar. |
| **"Fischer's"** | Dropped | Unresolvable — nothing meets the no-guessing bar (per your prior approval) |
| **"Fayazi" (Ramat Shlomo)** | Dropped | Same — no primary-source match (per your prior approval) |
| **Yeshivat Darchei Noam (Petach Tikva)** | Left out | Grades 7–12 yeshiva tichonit, not a post-high-school program — out of directory scope (per your prior approval) |
| **Kiryat Gat** | No action | Both real institutions already listed and well-filled (§1) |

---

## 4. Proposed internship/volunteering additions — sourced list only, not yet added

Checked ~35 well-known Israel gap-year/internship/volunteer program names against the
catalog directly (not just search) — the existing 46 `volunteering`-tagged + 74
`essence-academic-internship`-tagged programs already cover essentially every major
provider: Onward Israel, Career Israel, Livnot U'Lehibanot, Sar-El, Yahel, Achvat Amim,
Aardvark Israel, Young Judaea (4 variants), Leket Israel, Save a Child's Heart, MDA
volunteer programs (2 variants), Garin Tzabar, New Israel Fund/Shatil, and more are all
already present. One genuine, sourced gap found:

### TALMA: The Israel Program for Excellence in English
| Field | Value | Source |
|---|---|---|
| Description | Teaching fellowship pairing Jewish educators from abroad with Israeli co-teachers to teach English in under-resourced schools (Summer Fellowship: ~3.5 weeks, late June–late July; also a Full Year Fellowship) | [talmaisrael.com](https://www.talmaisrael.com/) |
| Who it's for | English-speaking educators aged 21–36 with ≥1 year classroom experience (or equivalent, e.g. camp/after-school) | [Summer Fellowship page](https://www.talmaisrael.com/fellowship/summer-fellowship/) |
| Locations | Ben Shemen Youth Village plus partner schools nationwide (named examples: Nazareth Illit, Migdal HaEmek, Jerusalem, Mitzpe Ramon) | same |
| Cost | All expenses paid (flights, housing, insurance, meals) | same |
| Contact | admissions@talmaisrael.com | same |

**One candidate ruled out**: Tevel b'Tzedek is Jerusalem-HQ'd but its actual volunteer
programming (checked directly) runs in Mphande, Zambia — not Israel-based, so out of
scope for this directory despite the Israeli parent org.

Nothing else written pending your go-ahead on this list specifically (per your
instruction to propose separately from the confirmed additions above).

---

## Next steps

Waiting on your approval before writing anything. Once approved, this becomes:
- `data/researched-programs-24.json` — Mahanaim, Yeshivat Eshtamoa, Hadas (Israeli) — imported `--status=PENDING`
- `prisma/apply-program-additions-24.ts` — Shavei Chevron enrichment, Har Shalom `nameHe`, Shuvu Achim `contactPhone`, Lindenbaum overseas-row field updates
- `research/hebrew-names-2026-08.json` — the CONFIRMED `nameHe` values above, via the existing `import-hebrew-names.ts`
- (separately, only if you also approve §4) a TALMA entry

All exercised against a Neon branch first, snapshotted before any overwrite, with
row-count verification printed after every write — never run directly against
production.
