import Link from "next/link";
import { listPrograms } from "@/lib/programs";
import ProgramCard from "@/components/ProgramCard";

export default async function Home() {
  const programs = await listPrograms({});
  const featured = programs.slice(0, 6);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-4 text-center sm:text-left">
        <h1 className="text-3xl font-semibold tracking-tight text-primary dark:text-white sm:text-4xl">
          The wiki for Jewish Israel programs
        </h1>
        <p className="max-w-2xl text-black/60 dark:text-white/60">
          Gap years, 10-day summer trips, semester programs, and everything in
          between — reviews, videos, costs, and how to sign up, all in one
          place.
        </p>
        <div className="flex justify-center gap-3 sm:justify-start">
          <Link
            href="/programs"
            className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400"
          >
            Browse all programs
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Recently added
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((program) => (
            <ProgramCard key={program.slug} program={program} />
          ))}
        </div>
      </div>
    </div>
  );
}
