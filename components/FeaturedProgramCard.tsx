import Link from "next/link";
import Card from "@/components/ui/Card";
import { ProgramCardInfo, type ProgramCardProgram } from "@/components/ProgramCard";
import { VideoPlayer } from "@/components/VideoList";

/**
 * Used for manual "Recently added" entries that have a video attached.
 * Mobile: info stacked above the video. Desktop: side-by-side, with the
 * card enlarged overall (p-6/gap-6 vs the regular grid card's p-5) and a
 * condensed ~40% info column so the ~60% video column has room to render
 * at its natural size instead of being cramped.
 */
export default function FeaturedProgramCard({
  program,
  video,
}: {
  program: ProgramCardProgram;
  video: { id: string; url: string };
}) {
  return (
    <Card
      interactive
      className="flex flex-col gap-4 p-5 md:flex-row md:items-stretch md:gap-6 md:p-6"
    >
      <Link
        href={`/programs/${program.slug}`}
        className="flex flex-col md:basis-2/5 md:shrink-0"
      >
        <ProgramCardInfo program={program} gap="tight" />
      </Link>
      <div className="flex items-center md:basis-3/5">
        <VideoPlayer url={video.url} />
      </div>
    </Card>
  );
}
