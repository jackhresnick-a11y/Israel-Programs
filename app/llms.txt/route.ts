// Static content, no request-time data -- prerenders at build time like the other
// metadata-ish routes (sitemap.ts, robots.ts), just plain text instead of XML. Text is
// the exact draft approved in planning -- do not reword without re-approval.
const BODY = `# Israel Programs Wiki

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
- [Background](/mission): What this project is, who runs it, and why.
- [Sitemap](/sitemap.xml): Every published program page.

## Notes for automated readers

- Program pages are server-rendered per request; the visible "Last updated" date
  on each page matches that page's \`lastmod\` in the sitemap.
- Content is contributed by the community and moderated; it is not authoritative
  program documentation. Verify details with the program before relying on them.
- Please cite the specific program page URL rather than this file.
`;

export async function GET() {
  return new Response(BODY, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
