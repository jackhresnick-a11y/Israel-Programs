import Link from "next/link";
import Image from "next/image";
import { DURATION_LABELS, averageRating } from "@/lib/programs";
import type { DurationType } from "@/app/generated/prisma/client";

type ProgramCardProps = {
  program: {
    slug: string;
    name: string;
    description: string;
    logoUrl: string | null;
    location: string | null;
    durationType: DurationType;
    cost: string | null;
    tags: { id: string; name: string; slug: string }[];
    reviews: { rating: number }[];
  };
};

export default function ProgramCard({ program }: ProgramCardProps) {
  const rating = averageRating(program.reviews);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-blue-100 p-5 transition hover:border-amber-400 dark:border-blue-950 dark:hover:border-amber-500/70">
      <Link href={`/programs/${program.slug}`} className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
            {program.logoUrl ? (
              <Image
                src={program.logoUrl}
                alt={`${program.name} logo`}
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-semibold text-black/40 dark:text-white/40">
                {program.name.charAt(0)}
              </span>
            )}
          </div>
          <div>
            <h3 className="font-semibold leading-tight">{program.name}</h3>
            <p className="text-xs text-black/60 dark:text-white/60">
              {DURATION_LABELS[program.durationType]}
              {program.location ? ` · ${program.location}` : ""}
            </p>
          </div>
        </div>
        <p className="line-clamp-3 text-sm text-black/70 dark:text-white/70">
          {program.description}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap gap-1.5">
            {program.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              >
                #{tag.slug}
              </span>
            ))}
          </div>
          {rating !== null && (
            <span className="whitespace-nowrap text-black/60 dark:text-white/60">
              ★ {rating.toFixed(1)} ({program.reviews.length})
            </span>
          )}
        </div>
        {program.cost && (
          <p className="text-xs font-medium text-black/50 dark:text-white/50">
            {program.cost}
          </p>
        )}
      </Link>
      <Link
        href={`/programs/${program.slug}/edit`}
        className="self-end text-xs text-black/50 hover:underline dark:text-white/50"
      >
        Edit
      </Link>
    </div>
  );
}
