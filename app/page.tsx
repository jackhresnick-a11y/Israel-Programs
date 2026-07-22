import Link from "next/link";
import { listPrograms } from "@/lib/programs";
import { getDurationLabelMap } from "@/lib/duration";
import { listRecentReviews } from "@/lib/reviews";
import ProgramCard from "@/components/ProgramCard";
import FeaturedProgramCard from "@/components/FeaturedProgramCard";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { buttonVariants } from "@/components/ui/Button";
import PageContainer from "@/components/ui/PageContainer";
import { getHomeVideoSettings } from "@/lib/homeVideo";
import HomeVideoHero from "@/components/HomeVideoHero";
import {
  getRecentlyAddedConfig,
  resolveManualItems,
  type ResolvedRecentlyAddedItem,
} from "@/lib/recentlyAdded";

export default async function Home() {
  const recentlyAdded = await getRecentlyAddedConfig();

  const [featured, recentReviews, durationLabelMap, homeVideo] = await Promise.all([
    recentlyAdded.mode === "manual"
      ? resolveManualItems(recentlyAdded.items)
      : listPrograms({}).then((programs) =>
          programs.slice(0, 6).map(
            (program): ResolvedRecentlyAddedItem => ({ program, video: null })
          )
        ),
    listRecentReviews(3),
    getDurationLabelMap(),
    getHomeVideoSettings(),
  ]);

  return (
    <PageContainer width="wide" className="gap-10 py-16">
      <div className="relative flex flex-col gap-4 text-center sm:text-left">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Find your place in Israel
        </h1>
        <p className="max-w-2xl text-foreground/70 sm:mx-0">
          A community-built guide to gap years, yeshivot, seminaries, service, and
          everything in between.
        </p>

        <form action="/programs" className="mx-auto flex w-full max-w-2xl gap-2 sm:mx-0">
          <Input
            type="search"
            name="q"
            placeholder="Search programs by name, location, or tag…"
            aria-label="Search programs"
            className="flex-1 text-base"
          />
          <button type="submit" className={buttonVariants({ variant: "primary" })}>
            Search
          </button>
        </form>

        {/* Same copy as the old floating Disclaimer -- now a static strip under the
            primary search action instead of covering content on every page. */}
        <p className="mx-auto max-w-2xl text-xs text-muted sm:mx-0">
          <span className="text-accent" aria-hidden="true">
            &#9432;{" "}
          </span>
          Information may not be 100% accurate. If you&apos;re interested in a program, we
          recommend contacting them directly to confirm details.
        </p>

        <div className="flex justify-center sm:justify-start">
          <Link
            href="/programs"
            className="text-sm font-medium text-accent-hover hover:underline dark:text-accent"
          >
            Browse all programs →
          </Link>
        </div>

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
