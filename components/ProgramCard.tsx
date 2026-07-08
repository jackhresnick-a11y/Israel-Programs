import Link from "next/link";
import Image from "next/image";
import { DURATION_LABELS, averageRating } from "@/lib/programs";
import type { DurationType } from "@/app/generated/prisma/client";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

export type ProgramCardProgram = {
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

/** The name/blurb/hashtags block shared by the regular grid card and the featured (video) card. */
export function ProgramCardInfo({
  program,
  gap = "normal",
}: {
  program: ProgramCardProgram;
  /** "tight" is used by the featured card's condensed desktop info column. */
  gap?: "normal" | "tight";
}) {
  const rating = averageRating(program.reviews);

  return (
    <div className={gap === "tight" ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
          {program.logoUrl ? (
            <Image
              src={program.logoUrl}
              alt={`${program.name} logo`}
              width={48}
              height={48}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-serif text-lg font-semibold text-muted">
              {program.name.charAt(0)}
            </span>
          )}
        </div>
        <div>
          <h3 className="font-serif font-semibold leading-tight text-foreground">
            {program.name}
          </h3>
          <p className="text-xs text-muted">
            {DURATION_LABELS[program.durationType]}
            {program.location ? ` · ${program.location}` : ""}
          </p>
        </div>
      </div>
      <p className="line-clamp-3 text-sm text-foreground/80">
        {program.description}
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap gap-1.5">
          {program.tags.slice(0, 3).map((tag) => (
            <Badge key={tag.id} tone="tag">
              #{tag.slug}
            </Badge>
          ))}
        </div>
        {rating !== null && (
          <span className="whitespace-nowrap text-muted">
            <span className="text-accent">★</span> {rating.toFixed(1)} (
            {program.reviews.length})
          </span>
        )}
      </div>
      {program.cost && (
        <p className="text-xs font-medium text-muted">{program.cost}</p>
      )}
    </div>
  );
}

export default function ProgramCard({ program }: { program: ProgramCardProgram }) {
  return (
    <Card interactive className="flex flex-col gap-3 p-5">
      <Link href={`/programs/${program.slug}`} className="flex flex-col gap-3">
        <ProgramCardInfo program={program} />
      </Link>
      <Link
        href={`/programs/${program.slug}/edit`}
        className="self-end text-xs text-muted hover:text-accent hover:underline"
      >
        Edit
      </Link>
    </Card>
  );
}
