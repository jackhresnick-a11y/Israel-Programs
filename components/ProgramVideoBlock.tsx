import { parseVideoLink } from "@/lib/videoEmbed";
import { VideoPlayer } from "@/components/VideoList";

/**
 * Renders Program.videoUrl -- the program's own overview video link, distinct from the
 * embedded Video[] relation VideoList renders below it. videoUrl is a plain admin-typed
 * URL (not pre-canonicalized like a Video row's stored url), so it's run through the same
 * parseVideoLink used by the Video upload path before handing it to VideoPlayer, which
 * expects a canonical embedUrl. An unrecognized URL degrades to a plain outbound link,
 * never a broken iframe.
 */
export default function ProgramVideoBlock({
  videoUrl,
  videoCredit,
  videoCreditUrl,
}: {
  videoUrl: string | null;
  videoCredit: string | null;
  videoCreditUrl: string | null;
}) {
  if (!videoUrl) return null;

  const embed = parseVideoLink(videoUrl);

  return (
    <div className="flex flex-col gap-2">
      {videoCredit && (
        <p className="text-xs text-muted">
          Video by{" "}
          {videoCreditUrl ? (
            <a
              href={videoCreditUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-hover underline"
            >
              {videoCredit}
            </a>
          ) : (
            <span className="text-foreground">{videoCredit}</span>
          )}
        </p>
      )}
      {embed ? (
        <VideoPlayer url={embed.embedUrl} />
      ) : (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded border border-border bg-surface-muted text-sm text-muted transition-colors duration-[120ms] ease-out hover:border-accent-hover hover:text-accent-hover"
        >
          <span className="underline">Watch video</span>
        </a>
      )}
    </div>
  );
}
