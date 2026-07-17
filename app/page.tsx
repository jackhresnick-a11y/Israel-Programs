import Link from "next/link";
import { listPrograms } from "@/lib/programs";
import { getDurationLabelMap } from "@/lib/duration";
import { listRecentReviews } from "@/lib/reviews";
import ProgramCard from "@/components/ProgramCard";
import FeaturedProgramCard from "@/components/FeaturedProgramCard";
import Card from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import PageContainer from "@/components/ui/PageContainer";
import { getSiteContent } from "@/lib/siteContent";
import { getCurrentRole } from "@/lib/roles";
import { getHomeVideoSettings } from "@/lib/homeVideo";
import HomeIntro from "@/components/HomeIntro";
import HomeVideoHero from "@/components/HomeVideoHero";
import {
  getRecentlyAddedConfig,
  resolveManualItems,
  type ResolvedRecentlyAddedItem,
} from "@/lib/recentlyAdded";

const DEFAULT_HOME_INTRO =
  "Every year, thousands of Jews set out to explore, live, volunteer, " +
  "serve, or study in Israel — but finding the right program can be " +
  "overwhelming. This is a living, community-built directory to help " +
  "you find what actually fits you.";

export default async function Home() {
  const recentlyAdded = await getRecentlyAddedConfig();

  const [
    featured,
    recentReviews,
    durationLabelMap,
    homeUrl,
    homeEnabled,
    homeSizeDesktop,
    homeOffsetXDesktop,
    homeOffsetYDesktop,
    homeLayerDesktop,
    homeSizeMobile,
    homeOffsetXMobile,
    homeOffsetYMobile,
    homeLayerMobile,
    homeUrlDark,
    homeIntro,
    role,
    homeVideo,
  ] = await Promise.all([
    recentlyAdded.mode === "manual"
      ? resolveManualItems(recentlyAdded.items)
      : listPrograms({}).then((programs) =>
          programs.slice(0, 6).map(
            (program): ResolvedRecentlyAddedItem => ({ program, video: null })
          )
        ),
    listRecentReviews(3),
    getDurationLabelMap(),
    getSiteContent("homeLogoUrl"),
    getSiteContent("homeLogoEnabled"),
    getSiteContent("homeLogoSize"),
    getSiteContent("homeLogoOffsetX"),
    getSiteContent("homeLogoOffsetY"),
    getSiteContent("homeLogoLayer"),
    getSiteContent("homeLogoSizeMobile"),
    getSiteContent("homeLogoOffsetXMobile"),
    getSiteContent("homeLogoOffsetYMobile"),
    getSiteContent("homeLogoLayerMobile"),
    getSiteContent("homeLogoUrlDark"),
    getSiteContent("homeIntro"),
    getCurrentRole(),
    getHomeVideoSettings(),
  ]);

  const homeDesktopHeight = Number(homeSizeDesktop) || 320;
  const homeDesktopOffsetX = Number(homeOffsetXDesktop) || 0;
  const homeDesktopOffsetY = Number(homeOffsetYDesktop) || 0;
  const homeDesktopFront = homeLayerDesktop === "front";
  const homeMobileHeight = Number(homeSizeMobile) || 160;
  const homeMobileOffsetX = Number(homeOffsetXMobile) || 0;
  const homeMobileOffsetY = Number(homeOffsetYMobile) || 0;
  const homeMobileFront = homeLayerMobile === "front";

  return (
    <PageContainer width="wide" className="gap-10 py-16">
      <div className="relative">
        {homeEnabled === "true" && homeUrl && (
          // No clip here (unlike the browse-page background watermark) so the
          // logo can be positioned above/below/beside the hero content; the
          // page-level overflow-x-clip in app/layout.tsx stops that from
          // creating a horizontal scrollbar. z-30 keeps a "front" logo below
          // the sticky nav's z-40 so it never paints over the header.
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {/* Anchored to the right edge, vertically centered, so the default
                (zero offset) placement already sits to the right of the
                heading; offsetX/offsetY let an admin nudge it from there. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={homeUrl}
              alt=""
              style={{
                height: `${homeMobileHeight}px`,
                transform: `translate(${homeMobileOffsetX}px, calc(-50% + ${homeMobileOffsetY}px))`,
              }}
              className={`absolute right-0 top-1/2 w-auto max-w-none select-none sm:hidden ${homeMobileFront ? "z-30" : ""} ${homeUrlDark ? "dark:hidden" : ""}`}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={homeUrl}
              alt=""
              style={{
                height: `${homeDesktopHeight}px`,
                transform: `translate(${homeDesktopOffsetX}px, calc(-50% + ${homeDesktopOffsetY}px))`,
              }}
              className={`absolute right-0 top-1/2 hidden w-auto max-w-none select-none sm:block ${homeDesktopFront ? "z-30" : ""} ${homeUrlDark ? "dark:hidden" : ""}`}
            />
            {homeUrlDark && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={homeUrlDark}
                  alt=""
                  style={{
                    height: `${homeMobileHeight}px`,
                    transform: `translate(${homeMobileOffsetX}px, calc(-50% + ${homeMobileOffsetY}px))`,
                  }}
                  className={`absolute right-0 top-1/2 hidden w-auto max-w-none select-none dark:block sm:dark:hidden ${homeMobileFront ? "z-30" : ""}`}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={homeUrlDark}
                  alt=""
                  style={{
                    height: `${homeDesktopHeight}px`,
                    transform: `translate(${homeDesktopOffsetX}px, calc(-50% + ${homeDesktopOffsetY}px))`,
                  }}
                  className={`absolute right-0 top-1/2 hidden w-auto max-w-none select-none sm:dark:block ${homeDesktopFront ? "z-30" : ""}`}
                />
              </>
            )}
          </div>
        )}
        <div className="relative flex flex-col gap-4 text-center sm:text-left">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Welcome to Israel Programs Wiki
          </h1>
          <HomeIntro
            text={homeIntro ?? DEFAULT_HOME_INTRO}
            isAdmin={role === "admin"}
          />

          <details className="group max-w-2xl text-left">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-accent-hover hover:text-accent [&::-webkit-details-marker]:hidden dark:text-accent dark:hover:text-accent-hover">
              About this project
              <span className="transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4 text-sm leading-relaxed text-foreground/70">
              <p>
                Every year, thousands of Jews — mostly from America — set out to
                explore, live, volunteer, serve, or study in Israel. But finding
                the right program, community, or path can be overwhelming: too
                many options, scattered information, and no easy way to know
                what actually fits you.
              </p>
              <p>
                This is a living, community-built directory of programs across
                Israel — gap years, yeshivot, seminaries, army service tracks,
                volunteer opportunities, and more. It&apos;s built and maintained
                by the people who&apos;ve actually done these programs, so the
                details stay accurate and honest.
              </p>
              <p>
                Our bigger goal: helping people not just find a program, but
                find their place — the community, the yishuv, the path in
                Israel that actually fits their life. This directory is just
                the beginning.
              </p>
              <p>
                Have experience with a program listed here? Add your review,
                suggest an edit, or list a program we&apos;re missing. This only
                works if the community helps keep it current.
              </p>
            </div>
          </details>

          <div className="flex justify-center gap-3 sm:justify-start">
            <Link href="/programs" className={buttonVariants({ variant: "primary" })}>
              Browse all programs
            </Link>
          </div>
        </div>
      </div>

      {homeVideo.enabled && homeVideo.config && <HomeVideoHero config={homeVideo.config} />}

      {featured.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            {recentlyAdded.heading}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map(({ program, video }) =>
              video ? (
                <div key={program.slug} className="sm:col-span-2 lg:col-span-3">
                  <FeaturedProgramCard program={program} durationLabelMap={durationLabelMap} video={video} />
                </div>
              ) : (
                <ProgramCard key={program.slug} program={program} durationLabelMap={durationLabelMap} />
              )
            )}
          </div>
        </div>
      )}

      {recentReviews.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Latest reviews
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {recentReviews.map((review) => (
              <Card key={review.id} className="flex flex-col gap-2 p-5">
                <span className="text-accent" aria-label={`${review.rating} out of 5 stars`}>
                  {"★".repeat(review.rating)}
                  <span className="text-border">{"★".repeat(5 - review.rating)}</span>
                </span>
                <p className="line-clamp-3 text-sm text-foreground/80">{review.text}</p>
                <p className="mt-auto text-xs text-muted">
                  {review.reviewerName} · {new Date(review.createdAt).toLocaleDateString()}
                </p>
                <Link
                  href={`/programs/${review.program.slug}`}
                  className="text-sm font-medium text-accent-hover hover:underline dark:text-accent"
                >
                  {review.program.name}
                </Link>
              </Card>
            ))}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
