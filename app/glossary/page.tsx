import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGlossaryEntries, isGlossaryEntryPublished } from "@/lib/glossary";
import { getCurrentRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import { SITE_NAME } from "@/lib/siteUrl";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

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

// No export const revalidate here -- getCurrentRole() below reads cookies (a Next.js
// Dynamic API), which already forces this route to render per request. Admin vs. public
// content genuinely differs by viewer here, so that's required, not a regression: a
// cached page could otherwise leak an admin's view to the next anonymous visitor.

export default async function GlossaryPage() {
  const [role, flag, allEntries] = await Promise.all([
    getCurrentRole(),
    getSiteContent("glossaryEnabled"),
    getGlossaryEntries(),
  ]);
  const isAdminViewer = role === "admin";
  const sectionEnabled = flag === "true";
  if (!sectionEnabled && !isAdminViewer) notFound();

  const entries = isAdminViewer ? allEntries : allEntries.filter(isGlossaryEntryPublished);
  const terms = entries.filter((e) => e.kind === "term");
  const comparisons = entries.filter((e) => e.kind === "comparison");

  return (
    <PageContainer width="base" className="gap-8">
      {!sectionEnabled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning-bg px-4 py-2 text-sm text-warning">
          Hidden from the public — the glossary section is turned off. Turn it on from{" "}
          <Link href="/admin/glossary" className="underline">
            /admin/glossary
          </Link>
          .
        </div>
      )}

      <PageHeader
        title="Glossary"
        description="Plain-language definitions for the terms you'll see across program listings — most useful if you're new to Israel program vocabulary."
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">Terms</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {terms.map((entry) => (
            <Card key={entry.slug} as={Link} href={`/glossary/${entry.slug}`} interactive className="flex flex-col gap-1 p-4">
              <span className="flex items-center gap-2">
                <span className="font-serif text-base font-semibold text-foreground">{entry.term}</span>
                {!isGlossaryEntryPublished(entry) && <Badge tone="warning">Hidden</Badge>}
              </span>
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
                <span className="flex items-center gap-2">
                  <span className="font-serif text-base font-semibold text-foreground">{entry.term}</span>
                  {!isGlossaryEntryPublished(entry) && <Badge tone="warning">Hidden</Badge>}
                </span>
                <span className="text-sm text-muted">{entry.summary}</span>
              </Card>
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
}
