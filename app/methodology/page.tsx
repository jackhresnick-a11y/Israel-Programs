import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/siteUrl";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

const METHODOLOGY_DESCRIPTION =
  "How the alumni survey is run, how poll results are published, and how reviews are moderated on Israel Programs Wiki.";

export const metadata: Metadata = {
  title: "Methodology",
  description: METHODOLOGY_DESCRIPTION,
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

// The page body renders inside app/layout.tsx's single site-wide <main> -- no
// page-level <main> here, since nesting a second one would be invalid.
export default function MethodologyPage() {
  return (
    <PageContainer width="base" className="gap-8">
      <PageHeader title="Methodology" />

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          How ratings work
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          Ratings come from alumni — people who actually attended the program. Anyone
          can fill out a program’s poll, and the questions are chosen to fit that kind
          of program.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Why some programs have no ratings
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          A program’s results stay hidden until enough alumni have answered. Small
          numbers aren’t reliable in either direction, and a handful of responses —
          good or bad — isn’t a fair picture of a program.
        </p>
        <p className="text-sm leading-relaxed text-foreground/80">
          Programs unlock in the order we find enough alumni for them. An unrated
          program is not a program that rated badly. It means we haven’t reached
          enough of its alumni yet. If you attended one, you can change that.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Rings and sliders
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          Rings show how strongly a program delivers in a specific area — Torah
          learning, Hebrew, preparation for the army. Higher is better.
        </p>
        <p className="text-sm leading-relaxed text-foreground/80">
          Sliders describe the character of a program rather than its quality.
          Whether people go out at night or stay in, whether the crowd is diverse or
          a particular type, how much freedom you have over your time. There is no
          good or bad end. What suits one person won’t suit another, and the point is
          to help you find where you fit.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Reviews
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          Written reviews are anonymous to readers. A moderator reads every review
          before it is published.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Independence
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          Israel Programs Wiki is free to use and not affiliated with any program,
          school, or organization. No program pays to be listed, and no program can
          pay for a better rating.
        </p>
      </section>
    </PageContainer>
  );
}
