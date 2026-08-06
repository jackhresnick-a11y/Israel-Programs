// TODO(jack): This page is intentionally unlinked and noindexed until real copy
// replaces the Lorem placeholder below. To re-link it once that copy is in, revert:
// - components/PollSummaryStrip.tsx: re-add the "How these results are collected"
//   Link next to the "Poll results" <h2> (was removed, along with its wrapping
//   flex row, when this page was unpublished).
// - app/mission/page.tsx: re-add the "Curious how program ratings..." paragraph
//   with the methodology Link, right after the mission-blocks/legacy-body content.
// - app/sitemap.ts: re-add the /methodology entry (same shape as the /mission one).
// - app/llms.txt/route.ts: re-add the "- [Methodology](/methodology): ..." bullet
//   under "## Key pages".
// - app/methodology/page.tsx (this file): remove the `robots: { index: false,
//   follow: false }` line below from `metadata`.
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/siteUrl";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

const METHODOLOGY_DESCRIPTION =
  "How the alumni survey is run, how poll results are published, and how reviews are moderated on Israel Programs Wiki.";

export const metadata: Metadata = {
  title: "Methodology",
  description: METHODOLOGY_DESCRIPTION,
  // Backstop noindex while this page is unlinked and still Lorem placeholder --
  // see the TODO at the top of this file for the full re-link checklist.
  robots: { index: false, follow: false },
  alternates: { canonical: "/methodology" },
  openGraph: {
    title: "Methodology",
    description: METHODOLOGY_DESCRIPTION,
    url: "/methodology",
    type: "website",
    siteName: SITE_NAME,
    images: "/opengraph-image",
  },
  twitter: { card: "summary_large_image", title: "Methodology", description: METHODOLOGY_DESCRIPTION },
};

// TODO(jack): Replace every Lorem placeholder paragraph below with the real
// methodology copy -- these sections and their headings are the approved
// structure, only the body text is a stand-in.
export default function MethodologyPage() {
  return (
    <PageContainer width="base" className="gap-8">
      <PageHeader title="Methodology" description={METHODOLOGY_DESCRIPTION} />

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          How the survey works
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
          incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
          nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          How results are published
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
          fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
          culpa qui officia deserunt mollit anim id est laborum.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          How reviews are moderated
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium
          doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore
          veritatis et quasi architecto beatae vitae dicta sunt explicabo.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          What we don&apos;t do
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed
          quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
        </p>
      </section>
    </PageContainer>
  );
}
