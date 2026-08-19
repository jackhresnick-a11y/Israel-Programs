import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getSiteContent } from "@/lib/siteContent";
import { getMissionBlocks } from "@/lib/mission";
import { SITE_NAME } from "@/lib/siteUrl";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import EmblemDefault from "@/components/EmblemDefault";
import MissionIcon from "@/components/MissionIcon";
import FormattedText from "@/components/FormattedText";
import MissionEditLink from "@/components/MissionEditLink";
import ContactForm from "@/components/ContactForm";

const MISSION_DESCRIPTION =
  "What Israel Programs Wiki is, who runs it, and why -- a community-driven, independent guide to Jewish Israel programs.";

// Previously missing entirely -- with no metadata export this page inherited the root
// layout's alternates.canonical (see app/layout.tsx), self-canonicalizing to the
// homepage even though it's a listed sitemap URL. Every real page needs its own.
export const metadata: Metadata = {
  title: "Background",
  description: MISSION_DESCRIPTION,
  alternates: { canonical: "/mission" },
  openGraph: {
    title: "Background",
    description: MISSION_DESCRIPTION,
    url: "/mission",
    type: "website",
    siteName: SITE_NAME,
    // Nested `openGraph` objects replace the parent's wholesale (not merge) -- see the
    // same note in app/programs/page.tsx.
    images: "/opengraph-image",
  },
  twitter: { card: "summary_large_image", title: "Background", description: MISSION_DESCRIPTION },
};

// Backstop only -- getMissionBlocks/getSiteContent are tagged "site-content" (see
// lib/siteContent.ts), so upsertSiteContent's revalidateTag already invalidates this
// page's cached HTML the moment an admin saves mission copy or the emblem. The 1-hour
// timer here just bounds staleness if that tag-based path is ever missed.
export const revalidate = 3600;

export default async function MissionPage() {
  const [blocks, legacyBody, emblemUrl] = await Promise.all([
    getMissionBlocks(),
    getSiteContent("mission"),
    getSiteContent("emblemLogoUrl"),
  ]);

  return (
    <PageContainer width="base" className="gap-8">
      <div className="flex justify-center">
        {emblemUrl ? (
          // Fixed square box regardless of the source image's actual aspect ratio (same
          // as the raw <img> this replaces -- neither applies an object-fit override, so
          // a non-square upload renders identically either way). 192 matches the largest
          // rendered size (sm:h-48/w-48 = 12rem = 192px at the default 4px spacing unit);
          // next/image resizes down from there for the 160px (h-40) mobile box instead of
          // shipping a full-resolution emblem to every visitor.
          <Image
            src={emblemUrl}
            alt="Israel Program Wiki emblem"
            width={192}
            height={192}
            className="h-40 w-40 sm:h-48 sm:w-48"
          />
        ) : (
          <EmblemDefault className="h-40 w-40 sm:h-48 sm:w-48" />
        )}
      </div>

      <PageHeader title="Background of Israel Programs Wiki" actions={<MissionEditLink />} />

      {blocks ? (
        <div className="flex flex-col gap-6">
          {blocks.map((block, i) => (
            <div key={i} className="flex flex-col gap-6">
              {i > 0 && <hr className="border-t border-accent/40" />}
              <div className="flex gap-4 sm:gap-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-hover">
                  <MissionIcon icon={block.icon} />
                </div>
                <div className="flex flex-col gap-2">
                  {block.heading && (
                    <h2 className="font-serif text-lg font-semibold text-foreground">
                      {block.heading}
                    </h2>
                  )}
                  {block.body.split(/\n\n+/).map((paragraph, j) => (
                    <p key={j} className="text-sm leading-relaxed text-foreground/80">
                      <FormattedText text={paragraph} />
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : legacyBody ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
          {legacyBody}
        </p>
      ) : (
        <p className="text-sm text-muted">No content has been set yet.</p>
      )}

      <p className="text-sm leading-relaxed text-foreground/80">
        Curious how program ratings and reviews are collected and published? Read our{" "}
        <Link href="/methodology" className="text-accent-hover underline">
          methodology
        </Link>
        .
      </p>

      <section className="flex flex-col gap-4">
        <hr className="border-t border-accent/40" />
        <h2 className="font-serif text-lg font-semibold text-foreground">Get in touch</h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          Questions, corrections, or a program we should know about? Send us a note.
        </p>
        <ContactForm />
      </section>
    </PageContainer>
  );
}
