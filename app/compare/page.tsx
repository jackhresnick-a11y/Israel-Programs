import Link from "next/link";
import {
  getProgramsBySlugs,
  listPublishedProgramNames,
  averageRating,
  DURATION_LABELS,
} from "@/lib/programs";
import { MAX_COMPARE } from "@/lib/compare";
import CompareAddControl from "@/components/CompareAddControl";
import BackButton from "@/components/BackButton";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";

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
            <Badge key={tag.id} tone="tag">
              #{tag.slug}
            </Badge>
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
    <PageContainer width="wide" className="gap-6">
      <BackButton fallbackHref="/programs" />
      <PageHeader
        title="Compare Programs"
        description={`Pick up to ${MAX_COMPARE} programs side by side.`}
      />

      {programs.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          <p>No programs selected yet.</p>
          <Link
            href="/programs"
            className={`mx-auto w-fit ${buttonVariants({ variant: "primary", size: "sm" })}`}
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
                        className="font-serif font-semibold leading-tight text-foreground hover:underline"
                      >
                        {program.name}
                      </Link>
                      <Link
                        href={`/compare?slugs=${encodeURIComponent(remaining.join(","))}`}
                        aria-label={`Remove ${program.name} from comparison`}
                        className="shrink-0 text-muted hover:text-danger"
                      >
                        ×
                      </Link>
                    </div>
                    <p className="text-xs text-muted">
                      {program.organization}
                    </p>
                  </div>
                );
              })}

              {ROWS.map((row) => (
                <div key={row.label} className="contents">
                  <div className="self-start text-sm font-medium text-muted">
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
    </PageContainer>
  );
}
