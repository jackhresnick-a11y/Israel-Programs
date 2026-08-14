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

/** Copy in every `sections[].body` below is a placeholder -- the real definitions are
 * written separately (see the glossary PR description). Do not treat this file's prose
 * as reviewed or accurate; only the structure, links, and schema are final. */
const PLACEHOLDER_BODY =
  "Copy to be written. This section will explain this term for a parent unfamiliar with Israel program terminology.";

export const DEFAULT_GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    slug: "mechina",
    term: "Mechina",
    termHe: "מכינה",
    alsoKnownAs: ["Pre-military academy", "Pre-army mechina"],
    kind: "term",
    summary: "A gap-year program that prepares young Israelis and overseas participants for army service.",
    sections: [
      { heading: "What it means", body: PLACEHOLDER_BODY },
      { heading: "Who it's for", body: PLACEHOLDER_BODY },
      { heading: "What a typical day looks like", body: PLACEHOLDER_BODY },
    ],
    programLinks: [{ label: "Browse mechina programs", href: "/programs?tags=mechina" }],
    related: ["yeshiva", "mechina-vs-yeshiva", "gap-year"],
  },
  {
    slug: "hesder",
    term: "Hesder",
    termHe: "הסדר",
    kind: "term",
    summary: "A yeshiva track that combines Torah study with active-duty Israeli army service.",
    sections: [
      { heading: "What it means", body: PLACEHOLDER_BODY },
      { heading: "Who it's for", body: PLACEHOLDER_BODY },
      { heading: "How the schedule works", body: PLACEHOLDER_BODY },
    ],
    programLinks: [{ label: "Browse hesder yeshivas", href: "/programs?tags=hesder" }],
    related: ["yeshiva", "hesder-vs-regular-yeshiva"],
  },
  {
    slug: "yeshiva",
    term: "Yeshiva",
    termHe: "ישיבה",
    kind: "term",
    summary: "A school for the study of Torah and Jewish religious texts, traditionally for men.",
    sections: [
      { heading: "What it means", body: PLACEHOLDER_BODY },
      { heading: "Who it's for", body: PLACEHOLDER_BODY },
      { heading: "Common variations", body: PLACEHOLDER_BODY },
    ],
    programLinks: [{ label: "Browse yeshivas", href: "/programs?tags=yeshiva" }],
    related: ["hesder", "mechina-vs-yeshiva", "hesder-vs-regular-yeshiva"],
  },
  {
    slug: "seminary",
    term: "Seminary",
    kind: "term",
    summary: "The common English term for a women's post-high-school program of Jewish religious study in Israel.",
    sections: [
      { heading: "What it means", body: PLACEHOLDER_BODY },
      { heading: "Who it's for", body: PLACEHOLDER_BODY },
      { heading: "Seminary vs. midrasha", body: PLACEHOLDER_BODY },
    ],
    // No dedicated "seminary" tag exists in the current catalog (see the glossary PR
    // description) -- this is a proxy filter (girls-only + spiritual-growth essence +
    // gap-year duration) until the program-type taxonomy is backfilled.
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
      { heading: "What it means", body: PLACEHOLDER_BODY },
      { heading: "Who it's for", body: PLACEHOLDER_BODY },
      { heading: "Midrasha vs. seminary", body: PLACEHOLDER_BODY },
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
      { heading: "What it means", body: PLACEHOLDER_BODY },
      { heading: "Common formats", body: PLACEHOLDER_BODY },
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
      { heading: "What it means", body: PLACEHOLDER_BODY },
      { heading: "Who it's for", body: PLACEHOLDER_BODY },
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
      { heading: "What it means", body: PLACEHOLDER_BODY },
      { heading: "Who it's for", body: PLACEHOLDER_BODY },
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
      { heading: "What it means", body: PLACEHOLDER_BODY },
      { heading: "How it's usually arranged", body: PLACEHOLDER_BODY },
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
      { heading: "The short answer", body: PLACEHOLDER_BODY },
      { heading: "Structure and focus", body: PLACEHOLDER_BODY },
      { heading: "Which one fits", body: PLACEHOLDER_BODY },
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
      { heading: "The short answer", body: PLACEHOLDER_BODY },
      { heading: "Time commitment", body: PLACEHOLDER_BODY },
      { heading: "Which one fits", body: PLACEHOLDER_BODY },
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
      { heading: "The short answer", body: PLACEHOLDER_BODY },
      { heading: "Daily focus", body: PLACEHOLDER_BODY },
      { heading: "Which one fits", body: PLACEHOLDER_BODY },
    ],
    programLinks: [
      { label: "Browse mechina programs", href: "/programs?tags=mechina" },
      { label: "Browse yeshivas", href: "/programs?tags=yeshiva" },
    ],
    related: ["mechina", "yeshiva"],
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
