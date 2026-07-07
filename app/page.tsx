import Link from "next/link";
import { listPrograms } from "@/lib/programs";
import ProgramCard from "@/components/ProgramCard";
import { buttonVariants } from "@/components/ui/Button";
import PageContainer from "@/components/ui/PageContainer";

export default async function Home() {
  const programs = await listPrograms({});
  const featured = programs.slice(0, 6);

  return (
    <PageContainer width="wide" className="gap-10 py-16">
      <div className="flex flex-col gap-4 text-center sm:text-left">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Welcome to Israel Programs Wiki
        </h1>
        <p className="max-w-2xl text-foreground/70">
          Every year, thousands of Jews set out to explore, live, volunteer,
          serve, or study in Israel — but finding the right program can be
          overwhelming. This is a living, community-built directory to help
          you find what actually fits you.
        </p>

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

      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Recently added
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((program) => (
            <ProgramCard key={program.slug} program={program} />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
