import { listProgramsWithPublishedBriefs } from "@/lib/briefs";

// ISR, not force-static: the "## Programs" section below needs a Prisma read, and this
// route must stay cached regardless -- force-static was set here specifically to fix a
// production cost incident (AI crawlers hit this route hard against the Hobby plan's
// data-transfer cap), and that fix must not regress just because the route gained one
// dynamic section. revalidate=3600 matches /programs/[slug]'s window; publishing a brief
// also calls revalidatePath("/llms.txt") via lib/revalidate.ts's revalidateProgram, so a
// publish is visible immediately rather than waiting for the hour to elapse.
export const revalidate = 3600;

// Text is the exact draft approved in planning -- do not reword without re-approval.
const HEAD = `# Israel Programs Wiki

> A community-driven, independent guide to Jewish and Israeli gap-year, summer,
> academic, volunteer, and pre-army programs in Israel. Program pages combine
> editorially maintained program details with alumni survey results and
> individually moderated alumni reviews.

Program ratings come from a structured alumni survey, not from open-web review
aggregation. Each survey question publishes independently once it clears a
per-program minimum response count. Rating questions are reported as a mean out
of 5 with the response count; descriptive questions describe a neutral spectrum
and are deliberately reported without a numeric average, because neither end of
those scales is "better".

Every alumni review on the site is individually reviewed by a moderator before
publication. Programs are not ranked against each other and there is no
aggregate score.

## Key pages

- [Browse all programs](/programs): Filterable index of every published program.
- [Methodology](/methodology): How the alumni survey is run, how results are
  published, and how reviews are moderated.
- [Background](/mission): What this project is, who runs it, and why.
- [Sitemap](/sitemap.xml): Every published program page.`;

const TAIL = `## Notes for automated readers

- Program pages are server-rendered per request; the visible "Last updated" date
  on each page matches that page's \`lastmod\` in the sitemap.
- Content is contributed by the community and moderated; it is not authoritative
  program documentation. Verify details with the program before relying on them.
- Raw video transcripts and unpublished drafts are never included below -- only
  briefs a moderator has explicitly published appear here.
- Please cite the specific program page URL rather than this file.
`;

export async function GET() {
  const programs = await listProgramsWithPublishedBriefs();

  // Emits nothing at all -- not an empty "## Programs" heading -- when no program has a
  // published brief yet, same "render nothing rather than an empty box" rule
  // components/ProgramBriefs.tsx uses on the program page itself.
  const programsSection =
    programs.length === 0
      ? ""
      : "\n## Programs\n\n" +
        programs
          .map((p) => {
            const briefLines = p.briefs.map((b) => `  ### ${b.typeName}\n\n  ${b.text}`).join("\n\n");
            return `- [${p.name}](/programs/${p.slug})\n\n${briefLines}`;
          })
          .join("\n\n") +
        "\n";

  const body = `${HEAD}\n${programsSection}\n${TAIL}`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
