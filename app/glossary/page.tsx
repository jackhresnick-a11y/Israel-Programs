import type { Metadata } from "next";
import Link from "next/link";
import { getGlossaryEntries } from "@/lib/glossary";
import { SITE_NAME } from "@/lib/siteUrl";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";

const GLOSSARY_DESCRIPTION =
  "Plain-language definitions of Israel program terms — mechina, hesder, yeshiva, seminary, and more — for parents and participants new to the vocabulary.";

export const metadata: Metadata = {
  title: "Glossary",
  description: GLOSSARY_DESCRIPTION,
  alternates: { canonical: "/glossary" },
  openGraph: {
    title: "Glossary",
    description: GLOSSARY_DESCRIPTION,
    url: "/glossary",
    type: "website",
    siteName: SITE_NAME,
    // Nested `openGraph` objects replace the parent's wholesale (not merge), so without
    // this the root's file-convention og:image silently drops off this page -- see
    // app/programs/page.tsx's metadata block for the same note.
    images: "/opengraph-image",
  },
  twitter: { card: "summary_large_image", title: "Glossary", description: GLOSSARY_DESCRIPTION },
};

// Backstop only -- getGlossaryEntries reads through getSiteContent, which is tagged
// "site-content" and invalidated immediately by upsertSiteContent (see
// lib/siteContent.ts). The 1-hour timer here just bounds staleness if that tag-based
// path is ever missed, same posture as app/mission/page.tsx.
export const revalidate = 3600;

export default async function GlossaryPage() {
  const entries = await getGlossaryEntries();
  const terms = entries.filter((e) => e.kind === "term");
  const comparisons = entries.filter((e) => e.kind === "comparison");

  return (
    <PageContainer width="base" className="gap-8">
      <PageHeader
        title="Glossary"
        description="Plain-language definitions for the terms you'll see across program listings — most useful if you're new to Israel program vocabulary."
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">Terms</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {terms.map((entry) => (
            <Card key={entry.slug} as={Link} href={`/glossary/${entry.slug}`} interactive className="flex flex-col gap-1 p-4">
              <span className="font-serif text-base font-semibold text-foreground">{entry.term}</span>
              <span className="text-sm text-muted">{entry.summary}</span>
            </Card>
          ))}
        </div>
      </section>

      {comparisons.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">Comparisons</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {comparisons.map((entry) => (
              <Card key={entry.slug} as={Link} href={`/glossary/${entry.slug}`} interactive className="flex flex-col gap-1 p-4">
                <span className="font-serif text-base font-semibold text-foreground">{entry.term}</span>
                <span className="text-sm text-muted">{entry.summary}</span>
              </Card>
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
}
