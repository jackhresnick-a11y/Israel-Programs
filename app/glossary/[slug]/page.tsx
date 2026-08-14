import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { getGlossaryEntries, getGlossaryEntry, glossaryArticleJsonLd } from "@/lib/glossary";
import { SITE_NAME, SITE_URL } from "@/lib/siteUrl";
import PageContainer from "@/components/ui/PageContainer";
import EntryHeader from "@/components/ui/EntryHeader";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

// Cheap to fully prerender -- unlike app/programs/[slug]/page.tsx's deliberate empty
// array (500+ DB-backed program pages would time out a build-time burst), this is ~12
// static entries with no per-page Prisma call beyond the one shared list fetch below.
export async function generateStaticParams() {
  const entries = await getGlossaryEntries();
  return entries.map((entry) => ({ slug: entry.slug }));
}

// Backstop only, same posture as app/glossary/page.tsx -- getGlossaryEntries is tagged
// "site-content" and invalidated immediately on an admin save.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getGlossaryEntry(slug);
  if (!entry) {
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
  const [entry, allEntries] = await Promise.all([getGlossaryEntry(slug), getGlossaryEntries()]);
  if (!entry) notFound();

  const relatedEntries = (entry.related ?? [])
    .map((relatedSlug) => allEntries.find((e) => e.slug === relatedSlug))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const jsonLd = glossaryArticleJsonLd(entry, SITE_URL, SITE_NAME);

  return (
    <PageContainer width="base" className="gap-8">
      {/* Static, server-generated JSON with no user input. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

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

      {relatedEntries.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Related terms
          </h2>
          <div className="flex flex-wrap gap-3">
            {relatedEntries.map((related) => (
              <Link
                key={related.slug}
                href={`/glossary/${related.slug}`}
                className="text-sm text-accent-hover underline"
              >
                {related.term}
              </Link>
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
