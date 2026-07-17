import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SignInButton, Show } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { getProgramBySlug, averageRating, toPublicProgram, shareDescription } from "@/lib/programs";
import { getDurationLabelMap } from "@/lib/duration";
import { listPublishedReferences } from "@/lib/references";
import { getCurrentRole } from "@/lib/roles";
import { isEmailVerificationFresh } from "@/lib/emailVerification";
import { getProgramPollSummary } from "@/lib/pollResults";
import { SITE_NAME } from "@/lib/siteUrl";
import ReviewForm from "@/components/ReviewForm";
import ReviewList from "@/components/ReviewList";
import VideoUploader from "@/components/VideoUploader";
import VideoList from "@/components/VideoList";
import DeleteProgramButton from "@/components/DeleteProgramButton";
import BackButton from "@/components/BackButton";
import ReferenceForm from "@/components/ReferenceForm";
import ReferenceList from "@/components/ReferenceList";
import PollSummaryStrip from "@/components/PollSummaryStrip";
import PageContainer from "@/components/ui/PageContainer";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";

// Shared between the page body and generateMetadata so the two only issue
// one Prisma query per request.
const getProgram = cache(getProgramBySlug);

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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { slug } = await params;
  const [program, role, { userId }, query, durationLabelMap] = await Promise.all([
    getProgram(slug),
    getCurrentRole(),
    auth(),
    searchParams,
    getDurationLabelMap(),
  ]);
  if (!program) notFound();

  const isModerator = role === "moderator" || role === "admin";
  // Known-bad addresses (bounced / reached the wrong person) are suppressed
  // entirely -- showing a dead contact is worse than showing nothing. A
  // never-checked (or stale-verified) address is still shown, just labeled,
  // so the site doesn't lose every contact email on day one of the workflow.
  const emailKnownBad = program.contactEmailStatus === "BOUNCED" || program.contactEmailStatus === "WRONG_CONTACT";
  const emailVerifiedFresh =
    program.contactEmailStatus === "VERIFIED" && isEmailVerificationFresh(program.contactEmailVerifiedAt);
  const showContactEmail = Boolean(program.contactEmail) && !emailKnownBad;
  const isOwner = userId === program.createdById;
  if (program.status !== "PUBLISHED" && !isModerator && !isOwner) notFound();

  const references = await listPublishedReferences(program.id);
  const rating = averageRating(program.reviews);

  // Exactly one banner ever renders — a just-submitted confirmation takes
  // priority over the program's persistent status, so the two never stack.
  const banner =
    query.created === "pending"
      ? { tone: "info" as const, text: "Thanks! Your submission is awaiting moderator approval." }
      : program.status === "PENDING"
        ? { tone: "warning" as const, text: "This program is awaiting moderator approval and isn't public yet." }
        : program.status === "REJECTED"
          ? { tone: "danger" as const, text: "This submission was rejected by a moderator and isn't public." }
          : null;

  const bannerClass = {
    info: "bg-info-bg text-info",
    warning: "bg-warning-bg text-warning",
    danger: "bg-danger-bg text-danger",
  };

  return (
    <PageContainer>
      <BackButton fallbackHref="/programs" />
      {banner && (
        <p className={`rounded-lg px-4 py-2 text-sm ${bannerClass[banner.tone]}`}>
          {banner.text}
        </p>
      )}
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-muted">
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
        <div className="flex-1">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            {program.name}
          </h1>
          <p className="text-sm text-muted">
            {program.organization}
            {program.location ? ` · ${program.location}` : ""}
          </p>
          {rating !== null && (
            <p className="mt-1 text-sm text-accent">
              {"★".repeat(Math.round(rating))}
              <span className="ml-1 text-muted">
                {rating.toFixed(1)} ({program.reviews.length} review
                {program.reviews.length === 1 ? "" : "s"})
              </span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/rate/${program.slug}`}
            className={buttonVariants({ variant: "primary", size: "sm" })}
          >
            Rate this program
          </Link>
          <Link
            href={`/programs/${program.slug}/edit`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Edit
          </Link>
          {isModerator && <DeleteProgramButton id={program.id} />}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {program.tags.map((tag) => (
          <Link key={tag.id} href={`/programs?tags=${tag.slug}`}>
            <Badge tone="tag" className="hover:bg-accent/25">
              #{tag.slug}
            </Badge>
          </Link>
        ))}
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
        {program.description}
      </p>

      <PollSummaryStrip summary={await getProgramPollSummary(program.id)} programSlug={program.slug} />

      {program.goodFor && (
        <div className="rounded-xl border border-accent/30 bg-accent/10 p-5">
          <h2 className="text-sm font-semibold text-accent-hover dark:text-accent">
            Who it&apos;s for
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
            {program.goodFor}
          </p>
        </div>
      )}

      <Card as="dl" className="grid grid-cols-1 gap-4 p-5 text-sm sm:grid-cols-2">
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
              className="mt-1 inline-block text-sm text-accent-hover underline hover:text-accent dark:text-accent dark:hover:text-accent-hover"
            >
              {program.signupUrl}
            </a>
          )}
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-muted">Contact</dt>
          <dd className="flex flex-col gap-0.5">
            {showContactEmail && (
              <span className="flex flex-wrap items-center gap-1.5">
                <a
                  href={`mailto:${program.contactEmail}?subject=${encodeURIComponent(
                    `Inquiry about ${program.name} (via Israel Programs Wiki)`
                  )}&body=${encodeURIComponent(
                    `Hello,\n\nI found ${program.name} on the Israel Programs Wiki and would like to learn more about the program.\n\nThank you!`
                  )}`}
                  className="text-accent-hover underline hover:text-accent dark:text-accent dark:hover:text-accent-hover"
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
                className="text-accent-hover underline hover:text-accent dark:text-accent dark:hover:text-accent-hover"
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
        <VideoList videos={program.videos} isModerator={isModerator} />
        <Show
          when="signed-in"
          fallback={
            <SignInButton mode="modal">
              <button className={buttonVariants({ variant: "secondary" })}>
                Sign in to add a video
              </button>
            </SignInButton>
          }
        >
          <VideoUploader programId={program.id} />
        </Show>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Reviews
        </h2>
        <ReviewList reviews={program.reviews} isModerator={isModerator} />
        <Show
          when="signed-in"
          fallback={
            <SignInButton mode="modal">
              <button className={buttonVariants({ variant: "secondary" })}>
                Sign in to leave a review
              </button>
            </SignInButton>
          }
        >
          <ReviewForm programId={program.id} />
        </Show>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Alumni References
        </h2>
        <p className="text-sm text-muted">
          People who attended this program and are willing to answer honest
          questions about their real experience.
        </p>
        <ReferenceList references={references} isModerator={isModerator} />
        <Show
          when="signed-in"
          fallback={
            <SignInButton mode="modal">
              <button className={buttonVariants({ variant: "secondary" })}>
                Sign in to volunteer as a reference
              </button>
            </SignInButton>
          }
        >
          <ReferenceForm programId={program.id} />
        </Show>
      </section>
    </PageContainer>
  );
}
