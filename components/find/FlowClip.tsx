"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { EMBED_ALLOW, EMBED_REFERRER_POLICY, EMBED_SANDBOX } from "@/components/VideoList";
import { withAutoplay } from "@/lib/homeVideoConfig";
import type { FlowVideoDTO } from "@/lib/flowClips";

/**
 * The inline clip on a /match question -- never blocks the options underneath it
 * (find-v2-question-spec.md: "options are usable before it finishes"), so this is a
 * self-contained block with no effect on the surrounding form/radio state. Same
 * poster-facade/hardened-iframe shape as HomeVideoHero.tsx, sharing its
 * withAutoplay/EMBED_* constants so the two can't drift.
 *
 * `autoplay` is what distinguishes the two firing shapes from
 * find-v2-question-spec.md: an ON_ANSWER clip's trigger IS the respondent's own
 * click/selection, so it mounts and plays immediately (no separate "click to play"
 * step -- the gesture already happened); an ON_DISPLAY clip (the Q2 opener) has no
 * such gesture yet, so it renders the click-to-play poster facade instead, same
 * "no autoplay with sound" rule HomeVideoHero follows.
 */
export default function FlowClip({ video, autoplay }: { video: FlowVideoDTO; autoplay: boolean }) {
  const [playing, setPlaying] = useState(autoplay);
  const [posterFailed, setPosterFailed] = useState(false);

  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      <div className="aspect-video w-full overflow-hidden rounded border border-border bg-surface">
        {playing ? (
          <iframe
            src={autoplay ? withAutoplay(video.embedUrl) : video.embedUrl}
            title={video.title}
            className="h-full w-full"
            sandbox={EMBED_SANDBOX}
            allow={EMBED_ALLOW}
            referrerPolicy={EMBED_REFERRER_POLICY}
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${video.title}`}
            className="group relative h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-hover focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {video.posterUrl && !posterFailed ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={video.posterUrl}
                  alt=""
                  loading="lazy"
                  onError={() => setPosterFailed(true)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-black/30 transition-colors duration-[120ms] ease-out group-hover:bg-black/40" />
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground transition-colors duration-[120ms] ease-out group-hover:bg-white"
                >
                  <Play width={20} height={20} strokeWidth={1.5} className="fill-current" />
                </span>
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-muted text-sm text-muted transition-colors duration-[120ms] ease-out group-hover:text-accent-hover">
                <span
                  aria-hidden
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/10 transition-colors duration-[120ms] ease-out group-hover:bg-accent/20"
                >
                  <Play width={20} height={20} strokeWidth={1.5} className="fill-current" />
                </span>
                <span>Play video</span>
              </div>
            )}
          </button>
        )}
      </div>
      {video.speaker && <p className="text-xs text-muted">{video.speaker}</p>}
      {video.transcript && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Read transcript</summary>
          <p className="mt-1 whitespace-pre-wrap">{video.transcript}</p>
        </details>
      )}
    </div>
  );
}
