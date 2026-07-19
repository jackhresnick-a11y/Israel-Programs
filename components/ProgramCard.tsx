import Link from "next/link";
import Image from "next/image";
import { averageRating } from "@/lib/programs";
import type { DurationType } from "@/app/generated/prisma/client";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ShareButton from "@/components/ShareButton";
import BookmarkButton from "@/components/BookmarkButton";
import { cn } from "@/lib/cn";

export type ProgramCardProgram = {
  id: string;
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
  durationLabelMap,
  gap = "normal",
  actionSpace = "none",
}: {
  program: ProgramCardProgram;
  /** Resolved duration labels (admin-editable, see lib/duration.ts's getDurationLabelMap) --
   * fetched once by the page and threaded down rather than queried per card. */
  durationLabelMap: Record<DurationType, string>;
  /** "tight" is used by the featured card's condensed desktop info column. */
  gap?: "normal" | "tight";
  /** Reserves room under the overlaid corner controls (see ProgramCard below) so the
   *  title/duration text never renders underneath them -- "sm" for bookmark + share
   *  (a single 28px-tall row), "lg" for bookmark + share stacked above the Compare pill
   *  (roughly twice as tall). Only the logo/title row needs clearance for the icon pair
   *  (it's always at the very top); only "lg" additionally needs clearance on the
   *  duration/location row directly beneath, since that's where the taller stack's
   *  second tier (the pill) actually sits. */
  actionSpace?: "none" | "sm" | "lg";
}) {
  const rating = averageRating(program.reviews);

  return (
    <div className={gap === "tight" ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      <div className={cn("flex items-center gap-3", actionSpace !== "none" && "pr-20")}>
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
        <h3 className="line-clamp-2 break-words font-serif font-semibold leading-tight text-foreground">
          {program.name}
        </h3>
      </div>
      <div className={cn("flex flex-wrap items-center gap-1.5", actionSpace === "lg" && "pr-28")}>
        <Badge tone="neutral">{durationLabelMap[program.durationType]}</Badge>
        {program.location && (
          <span className="text-xs text-muted">{program.location}</span>
        )}
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
    </div>
  );
}

export default function ProgramCard({
  program,
  durationLabelMap,
  action,
}: {
  program: ProgramCardProgram;
  durationLabelMap: Record<DurationType, string>;
  /** Rendered as an overlay in the card's top-right corner, outside the title link (e.g. the Compare pill). */
  action?: React.ReactNode;
}) {
  return (
    <Card interactive className="relative flex flex-col gap-3 p-5">
      <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          <BookmarkButton programId={program.id} name={program.name} />
          <ShareButton slug={program.slug} name={program.name} />
        </div>
        {action}
      </div>
      <Link href={`/programs/${program.slug}`} className="flex flex-col gap-3">
        <ProgramCardInfo
          program={program}
          durationLabelMap={durationLabelMap}
          actionSpace={action ? "lg" : "sm"}
        />
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
