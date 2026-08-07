import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getProgramBySlug, toPublicProgram, shareDescription } from "@/lib/programs";
import { getDurationLabelMap } from "@/lib/duration";
import { listPublishedReferences } from "@/lib/references";
import { getReferenceListVisibility } from "@/lib/referenceConfig";
import { isEmailVerificationFresh } from "@/lib/emailVerification";
import { getProgramPollSummary, getProgramReviewsSummary, countOpenContactOptIns } from "@/lib/pollResults";
import { getPublicPollLink } from "@/lib/pollConfig";
import { shouldShowContactHint } from "@/lib/contactOptIn";
import { listPublishedFaqs } from "@/lib/programFaq";
import { programDefinitionSentence } from "@/lib/programDefinition";
import { SITE_NAME } from "@/lib/siteUrl";
import VideoUploader from "@/components/VideoUploader";
import VideoList from "@/components/VideoList";
import DeleteProgramButton from "@/components/DeleteProgramButton";
import BackButton from "@/components/BackButton";
import ReferenceForm from "@/components/ReferenceForm";
import ReferenceList from "@/components/ReferenceList";
import SignedInGate from "@/components/SignedInGate";
import PollSummaryStrip from "@/components/PollSummaryStrip";
import PartnerCta from "@/components/PartnerCta";
import { resolveProgramPagePartnerCta } from "@/lib/partnerLinks";
import ReviewsSection from "@/components/ReviewsSection";
import PublicPollLink from "@/components/polls/PublicPollLink";
import ProgramFaqSection from "@/components/ProgramFaqSection";
import PageContainer from "@/components/ui/PageContainer";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";

// Shared between the page body and generateMetadata so the two only issue
// one Prisma query per request.
const getProgram = cache(getProgramBySlug);

// generateStaticParams returns [] on purpose -- this site has 500+ published programs,
// and prerendering all of them means ~8 concurrent Prisma queries (this page's data
// calls) times 500+ pages in one build-time burst. Tried returning the full slug list:
// it timed out and failed the build against production Neon (ETIMEDOUT partway through
// prerendering), which is exactly the kind of DB load spike this whole change exists to
// eliminate, not add on every deploy.
//
// An empty array is not a no-op, though -- it's required, not optional, for what
// dynamicParams+revalidate do next. A [slug] page with NO generateStaticParams at all
// is fully dynamic on every request; `export const revalidate` is silently ignored
// (confirmed by testing: /programs/[slug] served in ~2s flat across five consecutive
// requests to the same slug with revalidate set but no generateStaticParams, vs. ~30ms
// for an actually-cached static page). Once generateStaticParams exists -- even
// returning [] -- dynamicParams: true (the default) makes Next render an unlisted slug
// dynamically on its first request and then genuinely cache that output for
// `revalidate` seconds, the same as if it had been prerendered. That first-hit-then-
// cached behavior is the entire point here, so the empty array is load-bearing.
//
// Response counts and poll results shown on this page change as ratings come in, so the
// 1-hour timer is paired with revalidateProgram() calls (see lib/revalidate.ts) on every
// write path that can change what this page shows -- the timer is the backstop, not the
// primary mechanism.
export async function generateStaticParams() {
  return [];
}
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const program = await getProgram(slug);

  // Unpublished: no shareable preview. Anonymous visitors already 404 on the
  // page itself; an owner/moderator viewing a PENDING/REJECTED program gets
  // explicit noindex rather than inheriting the root layout's full OG
  // defaults onto a page that shouldn't be indexed or unfurled.
  if (!program || program.status !== "PUBLISHED") {
    return { robots: { index: false, follow: false } };
  }

  // Route share copy exclusively through toPublicProgram() so adminNote /
  // contactEmailSource / outreachCategory can never reach a meta tag.
  const pub = toPublicProgram(program);
  const description = shareDescription(pub.description);
  const path = `/programs/${slug}`;

  return {
    title: pub.name,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: pub.name,
      description,
      url: path,
      type: "website",
      siteName: SITE_NAME,
    },
    twitter: { card: "summary_large_image", title: pub.name, description },
  };
}

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [program, durationLabelMap] = await Promise.all([getProgram(slug), getDurationLabelMap()]);
  if (!program) notFound();

  const definitionSentence = programDefinitionSentence(program);
  // Known-bad addresses (bounced / reached the wrong person) are suppressed
  // entirely -- showing a dead contact is worse than showing nothing. A
  // never-checked (or stale-verified) address is still shown, just labeled,
  // so the site doesn't lose every contact email on day one of the workflow.
  const emailKnownBad = program.contactEmailStatus === "BOUNCED" || program.contactEmailStatus === "WRONG_CONTACT";
  const emailVerifiedFresh =
    program.contactEmailStatus === "VERIFIED" && isEmailVerificationFresh(program.contactEmailVerifiedAt);
  const showContactEmail = Boolean(program.contactEmail) && !emailKnownBad;
  // Unconditional: a PENDING/REJECTED program's own owner or a moderator used to be
  // able to preview it here via a role/ownership exception, but that required a
  // per-request auth() call that forced this whole page dynamic. They now use
  // /programs/[slug]/edit instead (see ProgramForm.tsx's post-submit redirect and
  // that page's own owner-or-moderator gate, which still applies).
  if (program.status !== "PUBLISHED") notFound();

  const [{ show: showReferenceList, approvedCount: approvedReferenceCount }, openContactOptIns] = await Promise.all([
    getReferenceListVisibility(program.id),
    countOpenContactOptIns(program.id),
  ]);
  const references = showReferenceList ? await listPublishedReferences(program.id) : [];
  const publicPollLink = await getPublicPollLink(program.id);
  const showContactHint = shouldShowContactHint(openContactOptIns, approvedReferenceCount);

  // Poll summary is used both by PollSummaryStrip and by the partner-CTA placement below,
  // so resolve it once. `summary.visible` is the locked/insufficient-ratings signal.
  const pollSummary = await getProgramPollSummary(program.id);
  const hasReferences = showReferenceList && references.length > 0;
  // At most one partner CTA per program page: slot 4 (locked ratings) wins any tie with
  // slot 1 (no references). `placement` tells us which region renders it.
  const partnerCta = await resolveProgramPagePartnerCta({
    programId: program.id,
    hasReferences,
    pollVisible: pollSummary.visible,
  });

  return (
    <PageContainer>
      <BackButton fallbackHref="/programs" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-muted">
            {program.logoUrl ? (
              <Image
                src={program.logoUrl}
                alt={`${program.name} logo`}
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-serif text-2xl font-semibold text-muted">
                {program.name.charAt(0)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="break-words font-serif text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {program.name}
            </h1>
            {program.nameHe && (
              <p dir="rtl" lang="he" className="break-words text-sm text-muted">
                {program.nameHe}
              </p>
            )}
            <p className="text-sm text-muted">
              {program.organization}
              {program.location ? ` · ${program.location}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Link
            href={`/programs/${program.slug}/edit`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Edit
          </Link>
          <DeleteProgramButton id={program.id} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {program.tags.map((tag) => (
          <Link key={tag.id} href={`/programs?tags=${tag.slug}`} prefetch={false}>
            <Badge tone="tag" className="hover:bg-accent/25">
              #{tag.slug}
            </Badge>
          </Link>
        ))}
      </div>

      {definitionSentence && (
        <p className="text-sm leading-relaxed text-foreground/80">{definitionSentence}</p>
      )}

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
        {program.description}
      </p>

      <PollSummaryStrip
        summary={pollSummary}
        programSlug={program.slug}
        programName={program.name}
        publicPollLink={publicPollLink}
      />

      {/* Slot 4: partner CTA in the locked / insufficient-ratings region. Renders only
          when the one-per-page resolver picked PROGRAM_LOCKED (which already required
          !pollSummary.visible). */}
      {partnerCta?.placement === "PROGRAM_LOCKED" && <PartnerCta slot={partnerCta.slot} />}

      {publicPollLink && <PublicPollLink link={publicPollLink} />}

      <ProgramFaqSection programId={program.id} faqs={await listPublishedFaqs(program.id)} />

      {program.goodFor && (
        <div className="rounded border border-accent/30 bg-accent/10 p-4">
          <h2 className="text-sm font-semibold text-accent-hover">
            Who it&apos;s for
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
            {program.goodFor}
          </p>
        </div>
      )}

      <Card as="dl" className="grid grid-cols-1 gap-4 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-muted">Duration</dt>
          <dd>
            {durationLabelMap[program.durationType]}
            {program.durationText ? ` — ${program.durationText}` : ""}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-muted">
            How to sign up
          </dt>
          <dd className="whitespace-pre-wrap">
            {program.signupInstructions || "Contact the program directly."}
          </dd>
          {program.signupUrl && (
            <a
              href={program.signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm text-accent-hover underline"
            >
              {program.signupUrl}
            </a>
          )}
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-muted">Contact</dt>
          <dd className="flex flex-col gap-1">
            {showContactEmail && (
              <span className="flex flex-wrap items-center gap-2">
                <a
                  href={`mailto:${program.contactEmail}?subject=${encodeURIComponent(
                    `Inquiry about ${program.name} (via Israel Programs Wiki)`
                  )}&body=${encodeURIComponent(
                    `Hello,\n\nI found ${program.name} on the Israel Programs Wiki and would like to learn more about the program.\n\nThank you!`
                  )}`}
                  className="text-accent-hover underline"
                >
                  {program.contactEmail}
                </a>
                {emailVerifiedFresh ? (
                  <Badge tone="success">Verified</Badge>
                ) : (
                  <Badge tone="neutral">Not yet verified</Badge>
                )}
              </span>
            )}
            {program.contactPhone && <span>{program.contactPhone}</span>}
            {program.contactWebsite && (
              <a
                href={program.contactWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-hover underline"
              >
                {program.contactWebsite}
              </a>
            )}
            {!showContactEmail && !program.contactPhone && !program.contactWebsite && (
              <span>Not listed</span>
            )}
          </dd>
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Videos
        </h2>
        <VideoList videos={program.videos} />
        <SignedInGate action="add a video">
          <VideoUploader programId={program.id} />
        </SignedInGate>
      </section>

      <ReviewsSection
        programId={program.id}
        programName={program.name}
        summary={await getProgramReviewsSummary(program.id)}
      />

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Alumni References
        </h2>
        {/* Aggregate hint only -- covers both the published-references list below AND
            poll respondents who separately opted in to being contacted (never publicly
            distinguished as two sources; see lib/contactOptIn.ts). Suppressed entirely
            when there's zero signal from either, rather than showing an empty promise. */}
        {showContactHint && (
          <p className="text-sm text-muted">
            Some past participants have offered to answer questions about their experience.
          </p>
        )}
        {showReferenceList && <ReferenceList references={references} />}
        {/* Slot 1: partner CTA IN PLACE OF the references list, only when the program has
            no references AND the one-per-page resolver picked PROGRAM_NO_REFERENCES (i.e.
            slot 4 did not win). Never renders alongside an actual references list. */}
        {partnerCta?.placement === "PROGRAM_NO_REFERENCES" && <PartnerCta slot={partnerCta.slot} />}
        <SignedInGate action="volunteer as a reference">
          <ReferenceForm programId={program.id} />
        </SignedInGate>
      </section>

      {/* Same Program.updatedAt field app/sitemap.ts's listPublishedProgramSlugsForSitemap
          selects for `lastmod` -- this visible date and the sitemap entry can never drift
          apart. timeZone pinned to UTC since this renders server-side and an unpinned
          locale date would shift with the deploy region. */}
      <p className="text-xs text-muted">
        Last updated:{" "}
        <time dateTime={program.updatedAt.toISOString()}>
          {program.updatedAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}
        </time>
      </p>
    </PageContainer>
  );
}
