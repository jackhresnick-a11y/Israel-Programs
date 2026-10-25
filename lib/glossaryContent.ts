/**
 * Split out from lib/glossary.ts because that file also exports functions that import
 * lib/siteContent.ts (which pulls in lib/prisma.ts, and therefore `pg` -- fine for server
 * components/routes, but a future admin form for this content would be a "use client"
 * component that only needs these types/constants/schema, and bundling `pg` into the
 * client build fails (it needs Node built-ins like `tls`). Same split as
 * lib/missionBlocks.ts vs lib/mission.ts and lib/tagTints.ts vs lib/tags.ts.
 *
 * DEFAULT_GLOSSARY_ENTRIES ships the placeholder content for the initial glossary launch.
 * lib/glossary.ts's getGlossaryEntries() checks the `glossaryEntries` SiteContent row
 * first and falls back to this array -- so an admin edit (once a form exists) overrides
 * these defaults with zero code changes, same pattern as missionBlocks.
 */
import { z } from "zod";

export const glossaryEntryKindSchema = z.enum(["term", "comparison"]);
export type GlossaryEntryKind = z.infer<typeof glossaryEntryKindSchema>;

const glossarySectionSchema = z.object({
  heading: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
});
export type GlossarySection = z.infer<typeof glossarySectionSchema>;

const glossaryProgramLinkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  href: z.string().trim().startsWith("/programs"),
});
export type GlossaryProgramLink = z.infer<typeof glossaryProgramLinkSchema>;

export const glossaryEntrySchema = z.object({
  slug: z.string().trim().min(1).max(80),
  term: z.string().trim().min(1).max(120),
  termHe: z.string().trim().min(1).max(120).nullish(),
  alsoKnownAs: z.array(z.string().trim().min(1).max(120)).max(6).optional(),
  kind: glossaryEntryKindSchema,
  summary: z.string().trim().min(1).max(300),
  sections: z.array(glossarySectionSchema).min(1).max(8),
  // No .min(1) -- a term can exist with no matching /programs filter at all (e.g. no
  // corresponding tag yet). The detail page omits the "See these programs" section
  // entirely when this is empty, rather than rendering an empty-results block.
  programLinks: z.array(glossaryProgramLinkSchema).max(4),
  related: z.array(z.string().trim().min(1)).max(8).optional(),
  // Absent or true = published. Lets a single entry be hidden from the public without
  // touching the section-wide glossaryEnabled SiteContent flag (see lib/glossary.ts).
  published: z.boolean().optional(),
});
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;

/** Absent `published` defaults to visible -- matches every entry in
 * DEFAULT_GLOSSARY_ENTRIES below, none of which set the field. */
export function isGlossaryEntryPublished(entry: GlossaryEntry): boolean {
  return entry.published !== false;
}

// Cross-entry invariants that a single glossaryEntrySchema.parse can't see: slugs must
// be unique (they're the URL identifier), and every `related` slug must resolve to
// another entry in the same array. Enforced here rather than only in a unit test
// against the hardcoded defaults, because admin-submitted entries (lib/glossary.ts's
// saveGlossaryEntries, via app/api/admin/glossary/route.ts) now flow through this same
// schema and need the same guarantee at write time.
export const glossaryEntriesSchema = z
  .array(glossaryEntrySchema)
  .min(1)
  .max(60)
  .superRefine((entries, ctx) => {
    const seenSlugs = new Set<string>();
    entries.forEach((entry, index) => {
      if (seenSlugs.has(entry.slug)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate slug "${entry.slug}"`,
          path: [index, "slug"],
        });
      }
      seenSlugs.add(entry.slug);
    });

    const allSlugs = new Set(entries.map((entry) => entry.slug));
    entries.forEach((entry, index) => {
      (entry.related ?? []).forEach((relatedSlug, relatedIndex) => {
        if (!allSlugs.has(relatedSlug)) {
          ctx.addIssue({
            code: "custom",
            message: `Related slug "${relatedSlug}" does not match any entry`,
            path: [index, "related", relatedIndex],
          });
        }
      });
    });
  });

/** Every `sections[].body` below is reviewed, published-ready copy -- plain-language
 * definitions written for a parent or participant unfamiliar with Israel program
 * terminology, deliberately neutral about which specific programs are "best" (that
 * judgment belongs to the alumni survey/reviews, not the glossary). Kept general and
 * definitional rather than citing specific programs by name, since program-level facts
 * belong on that program's own page, not duplicated here where they'd drift out of sync. */

export const DEFAULT_GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    slug: "mechina",
    term: "Mechina",
    termHe: "מכינה",
    alsoKnownAs: ["Pre-military academy", "Pre-army mechina"],
    kind: "term",
    summary: "A gap-year program that prepares young Israelis and overseas participants for army service.",
    sections: [
      {
        heading: "What it means",
        body: "A mechina (Hebrew for \"preparatory\") is a one- or two-year program that combines physical training, Jewish and Zionist studies, volunteer work, and leadership development, generally aimed at preparing 18-year-olds for military service in the Israel Defense Forces. Many mechinot have a religious-Zionist orientation, though secular and mixed mechinot exist as well. Most participants enroll for a single year, sometimes called \"mechina shana aleph\" (mechina, year one), though a smaller number of programs offer a second year.",
      },
      {
        heading: "Who it's for",
        body: "Mechinot are primarily built for Israeli 18-year-olds who have finished high school and are looking to mature, build resilience, and clarify their motivation before starting IDF service. Some mechinot also accept overseas participants, including those without an obligation to serve, who join for the personal-growth and Israel-experience elements rather than the pre-army track itself. Because the daily schedule is demanding and communal, mechinot suit participants who are comfortable with structure, physical activity, and group living.",
      },
      {
        heading: "What a typical day looks like",
        body: "A mechina day typically opens early with physical training or a run, followed by structured study sessions covering Jewish text, Zionist history, or current events, and afternoon blocks for volunteering in the local community, hiking, or navigation exercises. Evenings often include group discussion or a guest lecture, and the week is usually punctuated by a multi-day field trip or overnight hike roughly once a month. Most mechinot run Sunday through Thursday or Friday, with participants going home for Shabbat.",
      },
    ],
    programLinks: [{ label: "Browse mechina programs", href: "/programs?tags=mechina" }],
    related: [
      "yeshiva",
      "mechina-vs-yeshiva",
      "gap-year",
      "religious-mechina-vs-mechina",
      "religious-mechina-vs-yeshiva",
      "hesder-vs-religious-mechina",
    ],
  },
  {
    slug: "hesder",
    term: "Hesder",
    termHe: "הסדר",
    kind: "term",
    summary: "A yeshiva track that combines Torah study with active-duty Israeli army service.",
    sections: [
      {
        heading: "What it means",
        body: "Hesder (\"arrangement\") is a track that combines yeshiva-style Torah study with active-duty service in the Israel Defense Forces, typically over roughly five years in total. Participants usually study at the yeshiva full time for a stretch, then serve for a period of continuous active duty that's shorter than standard conscription (since the yeshiva study counts toward the overall arrangement), then return to complete their studies. Hesder yeshivas are religious-Zionist institutions, and because the track is tied to Israeli military service, it's generally not available to overseas participants without Israeli citizenship or aliyah plans.",
      },
      {
        heading: "Who it's for",
        body: "Hesder is built for religious-Zionist Israeli men who want to combine advanced Torah study with IDF service rather than choosing one before the other. It suits students who see themselves staying within a yeshiva framework past their service and are comfortable committing to a multi-year track rather than a single gap year.",
      },
      {
        heading: "How the schedule works",
        body: "The exact split varies by yeshiva, but a common pattern is an initial period of full-time study, then a continuous stretch of active service, then a final period of study to complete the arrangement; some hesder yeshivas interleave shorter study and service blocks instead of one long block of each. Either way, the total commitment usually runs several years longer than a typical one-year gap-year program.",
      },
    ],
    programLinks: [{ label: "Browse hesder yeshivas", href: "/programs?tags=hesder" }],
    related: ["yeshiva", "hesder-vs-regular-yeshiva", "hesder-vs-religious-mechina"],
  },
  {
    slug: "yeshiva",
    term: "Yeshiva",
    termHe: "ישיבה",
    kind: "term",
    summary: "A school for the study of Torah and Jewish religious texts, traditionally for men.",
    sections: [
      {
        heading: "What it means",
        body: "A yeshiva is an institution dedicated to the study of Torah and Jewish religious texts, especially Talmud, generally through chavruta (paired study) alongside lectures from a rabbi or senior teacher. Israel hosts many yeshivas spanning a wide range of religious outlook, study intensity, and student age. \"Yeshiva\" as commonly used by English-speaking gap-year students usually refers to a post-high-school program built for that age group specifically, distinct from a full-time adult yeshiva (a \"yeshiva gevoha\").",
      },
      {
        heading: "Who it's for",
        body: "Post-high-school yeshiva programs are aimed at religiously observant young men (the women's equivalent is usually called a seminary or midrasha -- see those entries) looking to deepen their Torah study for a gap year, a semester, or longer, often before or alongside college. Programs range from those geared toward students with a strong existing textual background to those built for students newer to intensive Jewish study.",
      },
      {
        heading: "Common variations",
        body: "Yeshivas vary along several axes: hesder yeshivas add IDF service to the track (see the hesder entry); some yeshivas emphasize Israeli integration and Hebrew immersion while others teach primarily in English; and religious orientation ranges from Haredi to religious-Zionist to more pluralistic or open Orthodox. Length also varies -- some programs run a single semester, others a full year, and some offer a second year (see shana bet).",
      },
    ],
    programLinks: [{ label: "Browse yeshivas", href: "/programs?tags=yeshiva" }],
    related: [
      "hesder",
      "mechina-vs-yeshiva",
      "hesder-vs-regular-yeshiva",
      "israeli-yeshiva-vs-english-speaking-yeshiva",
      "religious-mechina-vs-yeshiva",
    ],
  },
  {
    slug: "seminary",
    term: "Seminary",
    kind: "term",
    summary: "The common English term for a women's post-high-school program of Jewish religious study in Israel.",
    sections: [
      {
        heading: "What it means",
        body: "\"Seminary\" is the common English term for a women's post-high-school program of Jewish study in Israel, roughly the counterpart to a men's yeshiva program. Seminaries typically combine text study -- Tanach, Jewish law, and Jewish thought -- with programming on relationships, personal growth, and Israeli life, and most run either a single semester or a single year.",
      },
      {
        heading: "Who it's for",
        body: "Seminaries are built for religiously observant young women looking for a structured year of Jewish study and personal development before college, often as a parallel track to the yeshiva programs their male peers attend. Programs range in religious intensity and Israeli-integration level, so families choosing between seminaries usually weigh a program's hashkafa (religious outlook) and how much time is spent studying versus touring or volunteering.",
      },
      {
        heading: "Seminary vs. midrasha",
        body: "The two terms overlap heavily and some programs use them interchangeably, but \"midrasha\" is the more common term in Israeli usage, and midrashot as a group tend to run more Hebrew-language classes and closer integration with Israeli society than a typical English-language seminary. There's no firm rule -- the clearest way to tell them apart in practice is a program's own language of instruction and daily schedule rather than the label it uses.",
      },
    ],
    // No dedicated "seminary" tag exists in the current catalog -- this is a proxy
    // filter (girls-only + spiritual-growth essence + gap-year duration) until the
    // program-type taxonomy is backfilled.
    programLinks: [
      {
        label: "Browse programs like this",
        href: "/programs?tags=girls-only,essence-spiritual-growth&duration=GAP_YEAR",
      },
    ],
    related: ["midrasha", "gap-year-vs-seminary"],
  },
  {
    slug: "midrasha",
    term: "Midrasha",
    termHe: "מדרשה",
    kind: "term",
    summary: "The Hebrew/Israeli term for a women's program of Jewish study, often with more Israeli integration than a seminary.",
    sections: [
      {
        heading: "What it means",
        body: "A midrasha is the Hebrew/Israeli term for a women's program of Jewish study, functionally similar to what English-speaking students call a seminary (see that entry) but generally with more Hebrew-language instruction and closer day-to-day integration into Israeli society. Midrashot are a common destination for religious young women doing a gap year of study, sometimes alongside sherut leumi.",
      },
      {
        heading: "Who it's for",
        body: "Midrashot suit students who want more Hebrew immersion and Israeli-society integration than a typical English-language seminary offers, whether or not they're fluent going in. Many midrashot combine study with volunteering, national-service-adjacent tracks, or informal integration into an Israeli community.",
      },
      {
        heading: "Midrasha vs. seminary",
        body: "As with the seminary entry above, the line between the two terms is blurry and program-specific. A midrasha is more likely to teach primarily in Hebrew and place students closer to Israeli daily life, while a seminary more often teaches in English with a more insulated, English-speaking cohort -- but check each program directly rather than assuming from the label alone.",
      },
    ],
    // No dedicated "midrasha" tag exists yet either -- proxy filter (girls-only +
    // medium/high Israeli integration) until the program-type taxonomy is backfilled.
    programLinks: [
      {
        label: "Browse programs like this",
        href: "/programs?tags=girls-only,integration-high,integration-medium",
      },
    ],
    related: ["seminary"],
  },
  {
    slug: "gap-year",
    term: "Gap year",
    kind: "term",
    summary: "A year between high school and college, often spent studying, volunteering, or training in Israel.",
    sections: [
      {
        heading: "What it means",
        body: "A gap year is a year taken between high school and college, and in the context of Israel programs usually means a year spent studying, volunteering, or training in Israel rather than starting college immediately. Israel gap-year programs span yeshivas and seminaries, mechinot, service and volunteer programs, and Hebrew-immersion tracks, and can run anywhere from a semester to a full year, with some extending into a second year (see shana bet).",
      },
      {
        heading: "Common formats",
        body: "Common Israel gap-year formats include yeshiva or seminary programs centered on religious text study; mechinot centered on pre-army preparation and personal growth; volunteer or service programs combining Hebrew study with community work; and touring programs that move between cities and regions rather than basing at one campus. Many participants choose based on religious orientation, program length, and how much time is spent studying versus doing hands-on activities.",
      },
    ],
    programLinks: [{ label: "Browse gap year programs", href: "/programs?duration=GAP_YEAR" }],
    related: ["shana-bet", "gap-year-vs-seminary"],
  },
  {
    slug: "ulpan",
    term: "Ulpan",
    termHe: "אולפן",
    kind: "term",
    summary: "An intensive Hebrew-language study program.",
    sections: [
      {
        heading: "What it means",
        body: "An ulpan is an intensive Hebrew-language program, typically full-time and immersive, designed to bring a participant from limited or no Hebrew to conversational or functional fluency over a period of weeks to months. The term is used both for short-term programs aimed at overseas students and for the longer-running Hebrew classes new immigrants (olim) take as part of absorption into Israeli life.",
      },
      {
        heading: "Who it's for",
        body: "Ulpan suits participants whose main goal is Hebrew fluency rather than religious study or pre-army training specifically, including students planning to study, volunteer, or live in Israel afterward and wanting a functional base in the language first. Some gap-year and service programs build an ulpan component into their first weeks for exactly this reason, even when Hebrew isn't the program's main focus.",
      },
    ],
    programLinks: [{ label: "Browse ulpan programs", href: "/programs?tags=ulpan" }],
    related: ["sherut-leumi"],
  },
  {
    slug: "sherut-leumi",
    term: "Sherut leumi",
    termHe: "שירות לאומי",
    alsoKnownAs: ["National service"],
    kind: "term",
    summary: "A national civilian service program, often chosen by religious women as an alternative to army service.",
    sections: [
      {
        heading: "What it means",
        body: "Sherut leumi (national service) is a voluntary, non-military civilian service program, most often chosen by religious Israeli women as an alternative to army service, though some religious men and others also participate. Volunteers typically serve for one to two years in schools, hospitals, social-service organizations, or community programs, and receive a small stipend along with benefits similar to those given to soldiers.",
      },
      {
        heading: "Who it's for",
        body: "Sherut leumi is generally open only to those who would otherwise be subject to Israeli conscription, so it isn't typically available to overseas participants without Israeli citizenship. It's a common path for religious young women who prefer a civilian service framework to army service, and is sometimes combined with or followed by a year of study at a midrasha.",
      },
    ],
    programLinks: [
      { label: "Browse sherut leumi programs", href: "/programs?tags=sherut-leumi-national-service" },
    ],
    related: ["ulpan", "shana-bet"],
  },
  {
    slug: "shana-bet",
    term: "Shana bet",
    termHe: "שנה ב׳",
    alsoKnownAs: ["Second year"],
    kind: "term",
    summary: "A second year added onto a one-year gap-year program, at the same or a different institution.",
    sections: [
      {
        heading: "What it means",
        body: "Shana bet (\"year two\") refers to an additional year added onto a one-year gap-year program, either continuing at the same yeshiva, seminary, or mechina, or moving to a different institution for the second year. Some programs are structured from the outset as two-year tracks, while others treat the second year as an optional extension a student applies for after the first.",
      },
      {
        heading: "How it's usually arranged",
        body: "Where a program has a formal shana bet track, returning students typically apply, or are invited, partway through their first year, and the second year often carries more independence, advanced study material, or added responsibilities like mentoring newer students. Moving to a different institution for a second year is also common, particularly among students who want a change in religious intensity, location, or focus -- for example, moving from a study-heavy first year to a more service- or army-prep-oriented second year.",
      },
    ],
    programLinks: [{ label: "Browse multi-year programs", href: "/programs?duration=MULTI_YEAR" }],
    related: ["gap-year", "sherut-leumi"],
  },
  {
    slug: "gap-year-vs-seminary",
    term: "Gap year vs. seminary",
    kind: "comparison",
    summary: "How a general gap-year program differs from a women's seminary program.",
    sections: [
      {
        heading: "The short answer",
        body: "A gap year is the general category -- a year (or part of one) spent in Israel instead of starting college -- while a seminary is one specific type of gap-year program, built around women's Jewish text study. Every seminary program is a gap-year program, but far from every gap-year program is a seminary.",
      },
      {
        heading: "Structure and focus",
        body: "A general gap-year program might emphasize volunteering, touring, Hebrew immersion, or a mix of activities, with religious study as one component among several. A seminary is built specifically around structured, in-depth Jewish study -- Tanach, halacha, and Jewish thought -- as its central activity, with touring, chesed (volunteer) work, and social programming filling the remaining time.",
      },
      {
        heading: "Which one fits",
        body: "Students looking primarily for depth of religious study, in a single-sex, seminary-style environment, are usually better served by choosing a seminary directly. Students who want more flexibility across activities, locations, or religious intensity -- or who are considering non-religious-study formats like a mechina or a volunteer program -- are better served starting from the broader gap-year category and comparing across program types.",
      },
    ],
    programLinks: [
      { label: "Browse gap year programs", href: "/programs?duration=GAP_YEAR" },
      {
        label: "Browse seminary-style programs",
        href: "/programs?tags=girls-only,essence-spiritual-growth&duration=GAP_YEAR",
      },
    ],
    related: ["gap-year", "seminary"],
  },
  {
    slug: "hesder-vs-regular-yeshiva",
    term: "Hesder vs. regular yeshiva",
    kind: "comparison",
    summary: "How a hesder yeshiva's combined army-and-study track differs from a standard yeshiva program.",
    sections: [
      {
        heading: "The short answer",
        body: "A hesder yeshiva combines Torah study with active-duty IDF service over roughly five years total. A regular (non-hesder) yeshiva program is study-only, and for a gap-year-age student is typically one or two years long with no service component built in.",
      },
      {
        heading: "Time commitment",
        body: "Hesder is a multi-year commitment -- a mix of study and service that runs several years longer than a standard one- or two-year yeshiva gap-year program. A student choosing a regular yeshiva program keeps their post-yeshiva plans (army service, college, or otherwise) as a separate, later decision, while hesder bundles study and service into one continuous track from the start.",
      },
      {
        heading: "Which one fits",
        body: "Hesder suits Israeli men who are certain they want to serve in the IDF and want that service woven together with ongoing yeshiva study rather than treated as a separate life stage. A regular yeshiva program suits students -- Israeli or overseas -- who want a dedicated period of study without committing to a service arrangement as part of it; overseas students in particular should default to a regular yeshiva, since hesder's service component isn't open to them.",
      },
    ],
    // No NOT-operator on /programs, so this links the two filtered views side by
    // side (hesder-tagged vs. all yeshiva-tagged, which includes hesder programs)
    // rather than a single "yeshiva but not hesder" query.
    programLinks: [
      { label: "Browse hesder yeshivas", href: "/programs?tags=hesder" },
      { label: "Browse all yeshivas", href: "/programs?tags=yeshiva" },
    ],
    related: ["hesder", "yeshiva"],
  },
  {
    slug: "mechina-vs-yeshiva",
    term: "Mechina vs. yeshiva",
    kind: "comparison",
    summary: "How a pre-military mechina differs from a Torah-study-focused yeshiva.",
    sections: [
      {
        heading: "The short answer",
        body: "A mechina centers on physical training, Zionist and general Jewish studies, volunteering, and pre-army readiness; a yeshiva centers on in-depth study of Torah and Talmud as its main activity. A mechina prepares a student for what typically comes next -- IDF service -- while a yeshiva's focus is the study itself, whatever comes after it.",
      },
      {
        heading: "Daily focus",
        body: "A mechina day usually mixes physical training, hikes, volunteering, and study sessions covering Zionist history, current events, and Jewish thought, with structured group activities throughout. A yeshiva day centers on chavruta (paired) study and lectures on Talmud and Jewish law, typically with far more hours spent on text study and comparatively little physical training or volunteer work.",
      },
      {
        heading: "Which one fits",
        body: "A mechina fits a student -- most often an Israeli 18-year-old, though some accept overseas participants -- primarily focused on building resilience and life skills ahead of army service, over an in-depth text-study curriculum. A yeshiva fits a student whose priority is depth of religious learning itself, whether or not army service follows, and who wants to spend the bulk of the day in study rather than physical training or fieldwork.",
      },
    ],
    programLinks: [
      { label: "Browse mechina programs", href: "/programs?tags=mechina" },
      { label: "Browse yeshivas", href: "/programs?tags=yeshiva" },
    ],
    related: ["mechina", "yeshiva"],
  },
  // The four comparison entries below are STRUCTURE-ONLY placeholders (published:
  // false, TODO-marked copy) -- content pending, see PR description / plan doc. Each
  // TODO section body still satisfies glossarySectionSchema's non-empty-string
  // requirement so the array keeps parsing and the admin manager can load it.
  {
    slug: "religious-mechina-vs-mechina",
    term: "Religious mechina vs. mechina",
    kind: "comparison",
    summary: "TODO -- one-sentence summary of how a religious mechina differs from the broader mechina category.",
    sections: [
      {
        heading: "The short answer",
        body: "TODO -- short-answer paragraph: religious mechina is a subset of the broader mechina category, distinguished by X.",
      },
      {
        heading: "Religious life and daily schedule",
        body: "TODO -- how a religious mechina's daily schedule, religious observance, and orientation differ from a mechina generally.",
      },
      {
        heading: "Which one fits",
        body: "TODO -- guidance on which student fits a religious mechina versus a mechina more broadly.",
      },
    ],
    // No NOT-operator on /programs, so the second link is the whole mechina category
    // (religious mechinot included), not "non-religious mechinot" -- same limitation
    // noted on hesder-vs-regular-yeshiva above.
    programLinks: [
      { label: "Browse religious mechina programs", href: "/programs?tags=religious-mechina" },
      { label: "Browse all mechina programs", href: "/programs?tags=mechina" },
    ],
    related: ["mechina", "hesder-vs-religious-mechina"],
    published: false,
  },
  {
    slug: "religious-mechina-vs-yeshiva",
    term: "Religious mechina vs. yeshiva",
    kind: "comparison",
    summary: "TODO -- one-sentence summary of how a religious mechina differs from a yeshiva.",
    sections: [
      {
        heading: "The short answer",
        body: "TODO -- short-answer paragraph contrasting a religious mechina's pre-army/personal-growth focus with a yeshiva's Torah-study focus.",
      },
      {
        heading: "Religious life and daily schedule",
        body: "TODO -- how daily schedule, study intensity, and religious programming compare between a religious mechina and a yeshiva.",
      },
      {
        heading: "Which one fits",
        body: "TODO -- guidance on which student fits a religious mechina versus a yeshiva.",
      },
    ],
    programLinks: [
      { label: "Browse religious mechina programs", href: "/programs?tags=religious-mechina" },
      { label: "Browse yeshivas", href: "/programs?tags=yeshiva" },
    ],
    related: ["mechina", "yeshiva", "mechina-vs-yeshiva"],
    published: false,
  },
  {
    slug: "israeli-yeshiva-vs-english-speaking-yeshiva",
    term: "Israeli yeshiva vs. English-speaking yeshiva",
    kind: "comparison",
    summary: "TODO -- one-sentence summary of how an Israeli yeshiva differs from an English-speaking yeshiva.",
    sections: [
      {
        heading: "The short answer",
        body: "TODO -- short-answer paragraph contrasting an Israeli yeshiva's Hebrew-language, Israeli-integrated setup with an English-speaking yeshiva's English-language, overseas-cohort setup.",
      },
      {
        heading: "Language and cohort",
        body: "TODO -- how language of instruction, student body composition, and day-to-day integration into Israeli society differ between the two.",
      },
      {
        heading: "Which one fits",
        body: "TODO -- guidance on which student fits an Israeli yeshiva versus an English-speaking yeshiva.",
      },
    ],
    programLinks: [
      { label: "Browse Israeli yeshivas", href: "/programs?tags=israeli-yeshiva" },
      { label: "Browse English-speaking yeshivas", href: "/programs?tags=american-yeshiva" },
    ],
    related: ["yeshiva"],
    published: false,
  },
  {
    slug: "hesder-vs-religious-mechina",
    term: "Hesder vs. religious mechina",
    kind: "comparison",
    summary: "TODO -- one-sentence summary of how hesder's combined study-and-service track differs from a religious mechina.",
    sections: [
      {
        heading: "The short answer",
        body: "TODO -- short-answer paragraph contrasting hesder's multi-year study-and-service arrangement with a religious mechina's single pre-army year.",
      },
      {
        heading: "Time commitment",
        body: "TODO -- how total length and structure (hesder's roughly five-year arrangement vs. a religious mechina's typical one or two years) compare.",
      },
      {
        heading: "Which one fits",
        body: "TODO -- guidance on which student fits hesder versus a religious mechina.",
      },
    ],
    programLinks: [
      { label: "Browse hesder yeshivas", href: "/programs?tags=hesder" },
      { label: "Browse religious mechina programs", href: "/programs?tags=religious-mechina" },
    ],
    related: ["hesder", "mechina", "religious-mechina-vs-mechina"],
    published: false,
  },
];

/** Article schema (schema.org) for a glossary entry -- omits datePublished/dateModified
 * since the content model has no per-entry date and stamping build time would be a
 * fabricated one. Both are optional on Article. */
export function glossaryArticleJsonLd(entry: GlossaryEntry, siteUrl: string, siteName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: entry.term,
    description: entry.summary,
    url: `${siteUrl}/glossary/${entry.slug}`,
    publisher: {
      "@type": "Organization",
      name: siteName,
    },
    ...(entry.sections.length > 0
      ? {
          articleBody: entry.sections.map((s) => `${s.heading}\n${s.body}`).join("\n\n"),
        }
      : {}),
  };
}
