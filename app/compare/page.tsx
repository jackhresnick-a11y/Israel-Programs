import Link from "next/link";
import {
  getProgramsBySlugs,
  listPublishedProgramNames,
  averageRating,
  DURATION_LABELS,
} from "@/lib/programs";
import { MAX_COMPARE } from "@/lib/compare";
import CompareAddControl from "@/components/CompareAddControl";

type Row = {
  label: string;
  render: (program: Awaited<ReturnType<typeof getProgramsBySlugs>>[number]) => React.ReactNode;
};

const ROWS: Row[] = [
  {
    label: "Location",
    render: (p) => p.location || "Not listed",
  },
  {
    label: "Duration",
    render: (p) =>
      `${DURATION_LABELS[p.durationType]}${p.durationText ? ` — ${p.durationText}` : ""}`,
  },
  {
    label: "Cost",
    render: (p) => p.cost || "Not listed",
  },
  {
    label: "Rating",
    render: (p) => {
      const rating = averageRating(p.reviews);
      if (rating === null) return "No reviews yet";
      return `★ ${rating.toFixed(1)} (${p.reviews.length} review${p.reviews.length === 1 ? "" : "s"})`;
    },
  },
  {
    label: "Tags",
    render: (p) =>
      p.tags.length === 0 ? (
        "Not listed"
      ) : (
        <div className="flex flex-wrap gap-1">
          {p.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            >
              #{tag.slug}
            </span>
          ))}
        </div>
      ),
  },
  {
    label: "How to sign up",
    render: (p) => p.signupInstructions || "Contact the program directly.",
  },
];

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ slugs?: string }>;
}) {
  const { slugs: slugsParam } = await searchParams;
  const requestedSlugs = Array.from(
    new Set((slugsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean))
  ).slice(0, MAX_COMPARE);

  const [programs, allProgramNames] = await Promise.all([
    getProgramsBySlugs(requestedSlugs),
    listPublishedProgramNames(),
  ]);

  const currentSlugs = programs.map((p) => p.slug);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="border-l-4 border-amber-500 pl-4">
        <h1 className="text-2xl font-semibold tracking-tight text-primary dark:text-white">
          Compare Programs
        </h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Pick up to {MAX_COMPARE} programs side by side.
        </p>
      </div>

      {programs.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-lg border border-dashed border-blue-200 p-8 text-center text-sm text-black/50 dark:border-blue-900 dark:text-white/50">
          <p>No programs selected yet.</p>
          <Link
            href="/programs"
            className="mx-auto w-fit rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400"
          >
            Browse programs to compare
          </Link>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div
              className="grid w-fit min-w-full gap-x-6 gap-y-4"
              style={{
                gridTemplateColumns: `140px repeat(${programs.length}, minmax(220px, 1fr))`,
              }}
            >
              <div />
              {programs.map((program) => {
                const remaining = currentSlugs.filter((s) => s !== program.slug);
                return (
                  <div key={program.slug} className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/programs/${program.slug}`}
                        className="font-semibold leading-tight hover:underline"
                      >
                        {program.name}
                      </Link>
                      <Link
                        href={`/compare?slugs=${encodeURIComponent(remaining.join(","))}`}
                        aria-label={`Remove ${program.name} from comparison`}
                        className="shrink-0 text-black/40 hover:text-red-600 dark:text-white/40 dark:hover:text-red-400"
                      >
                        ×
                      </Link>
                    </div>
                    <p className="text-xs text-black/50 dark:text-white/50">
                      {program.organization}
                    </p>
                  </div>
                );
              })}

              {ROWS.map((row) => (
                <div key={row.label} className="contents">
                  <div className="self-start text-sm font-medium text-black/50 dark:text-white/50">
                    {row.label}
                  </div>
                  {programs.map((program) => (
                    <div key={program.slug} className="text-sm">
                      {row.render(program)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {programs.length < MAX_COMPARE && (
            <div className="max-w-xs">
              <CompareAddControl currentSlugs={currentSlugs} options={allProgramNames} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
