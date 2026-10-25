import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import {
  getGlossaryEntries,
  getGlossaryEntry,
  glossaryArticleJsonLd,
  isGlossaryEntryPublished,
} from "@/lib/glossary";
import { getCurrentRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import { SITE_NAME, SITE_URL } from "@/lib/siteUrl";
import PageContainer from "@/components/ui/PageContainer";
import EntryHeader from "@/components/ui/EntryHeader";
import Badge from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

// No generateStaticParams/revalidate here -- the page below reads viewer role, a Next.js
// Dynamic API that already forces per-request rendering (admin vs. public content
// genuinely differs by viewer). Static prerendering/ISR would either bake one viewer's
// role into a page served to everyone, or (with generateStaticParams alone) simply be
// ignored once the Dynamic API is in play -- so neither is useful to keep here.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [entry, flag] = await Promise.all([getGlossaryEntry(slug), getSiteContent("glossaryEnabled")]);
  // Role-independent on purpose -- metadata is what gets crawled/shared, not rendered
  // per-viewer. Same posture as app/programs/[slug]/page.tsx's unpublished-program
  // metadata: noindex whenever this wouldn't be visible to the public, regardless of
  // who's currently requesting it.
  const visibleToPublic = Boolean(entry) && flag === "true" && isGlossaryEntryPublished(entry!);
  if (!entry || !visibleToPublic) {
    return { robots: { index: false, follow: false } };
  }
  return {
    title: entry.term,
    description: entry.summary,
    alternates: { canonical: `/glossary/${entry.slug}` },
    openGraph: {
      title: entry.term,
      description: entry.summary,
      url: `/glossary/${entry.slug}`,
      type: "article",
      siteName: SITE_NAME,
      images: "/opengraph-image",
    },
    twitter: { card: "summary_large_image", title: entry.term, description: entry.summary },
  };
}

export default async function GlossaryEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [entry, allEntries, role, flag] = await Promise.all([
    getGlossaryEntry(slug),
    getGlossaryEntries(),
    getCurrentRole(),
    getSiteContent("glossaryEnabled"),
  ]);
  if (!entry) notFound();

  const isAdminViewer = role === "admin";
  const sectionEnabled = flag === "true";
  const entryPublished = isGlossaryEntryPublished(entry);
  const visibleToPublic = sectionEnabled && entryPublished;
  if (!visibleToPublic && !isAdminViewer) notFound();

  const hiddenReasons: string[] = [];
  if (!sectionEnabled) hiddenReasons.push("the glossary section is turned off");
  if (!entryPublished) hiddenReasons.push("this entry is unpublished");

  // Non-admin viewers never see a "related term" link that would 404 them -- the
  // candidate pool is published-only. Admins see everything, same as the index's
  // "Hidden" badge, so they can navigate to and fix an unpublished related entry.
  const relatedPool = isAdminViewer ? allEntries : allEntries.filter(isGlossaryEntryPublished);
  const relatedEntries = (entry.related ?? [])
    .map((relatedSlug) => relatedPool.find((e) => e.slug === relatedSlug))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const jsonLd = glossaryArticleJsonLd(entry, SITE_URL, SITE_NAME);

  return (
    <PageContainer width="base" className="gap-8">
      {/* Static, server-generated JSON with no user input. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {!visibleToPublic && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning-bg px-4 py-2 text-sm text-warning">
          Hidden from the public — {hiddenReasons.join(" and ")}. Manage this from{" "}
          <Link href="/admin/glossary" className="underline">
            /admin/glossary
          </Link>
          .
        </div>
      )}

      <EntryHeader title={entry.term} nameHe={entry.termHe} description={entry.summary}>
        {entry.alsoKnownAs && entry.alsoKnownAs.length > 0 && (
          <p className="mt-1 text-sm text-muted">Also known as: {entry.alsoKnownAs.join(", ")}</p>
        )}
      </EntryHeader>

      <div className="flex flex-col gap-6">
        {entry.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
              {section.heading}
            </h2>
            <p className="text-sm leading-relaxed text-foreground/80">{section.body}</p>
          </section>
        ))}
      </div>

      {entry.programLinks.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            See these programs
          </h2>
          <div className="flex flex-wrap gap-3">
            {entry.programLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(buttonVariants({ variant: "primary" }), "gap-2")}
              >
                {link.label}
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {relatedEntries.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Related terms
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {relatedEntries.map((related) => (
              <span key={related.slug} className="flex items-center gap-2">
                <Link
                  href={`/glossary/${related.slug}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-accent-hover hover:underline"
                >
                  {related.term}
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </Link>
                {!isGlossaryEntryPublished(related) && <Badge tone="warning">Hidden</Badge>}
              </span>
            ))}
          </div>
        </section>
      )}

      <Link href="/glossary" className="text-sm text-accent-hover underline">
        Back to the glossary
      </Link>
    </PageContainer>
  );
}
