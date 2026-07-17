"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/Button";
import { EMBED_ALLOW, EMBED_REFERRER_POLICY, EMBED_SANDBOX } from "@/components/VideoList";
import { effectivePosterUrl, type HomeVideoConfig } from "@/lib/homeVideoConfig";

const PROVIDER_LABEL: Record<HomeVideoConfig["provider"], string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
};

/** Autoplay only ever fires after the visitor's own click (see the button
 *  below), so this satisfies "no autoplay with sound" without needing a
 *  muted attribute -- nothing plays or loads before that click. */
function withAutoplay(embedUrl: string): string {
  try {
    const url = new URL(embedUrl);
    url.searchParams.set("autoplay", "1");
    return url.toString();
  } catch {
    return embedUrl;
  }
}

/**
 * Admin-configured homepage hero video: a click-to-play poster facade that
 * mounts a hardened iframe on click. Deliberately not a VideoPlayer
 * extension -- VideoPlayer (components/VideoList.tsx) mounts YouTube/Vimeo
 * iframes immediately by design, and this needs poster art plus
 * heading/description/CTA chrome that VideoPlayer's callers don't. Shared
 * verbatim between the homepage and the admin settings preview so the two
 * can never drift.
 */
export default function HomeVideoHero({ config }: { config: HomeVideoConfig }) {
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  const poster = effectivePosterUrl(config);
  const label = PROVIDER_LABEL[config.provider];
  const title = config.heading ?? "Featured video";
  const hasTextBlock = Boolean(config.heading || config.description || (config.ctaLabel && config.ctaHref));

  return (
    <section aria-label={title} className="flex flex-col gap-4">
      {hasTextBlock && (
        <div className="flex flex-col gap-2">
          {config.heading && (
            <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
              {config.heading}
            </h2>
          )}
          {config.description && <p className="text-sm text-foreground/70">{config.description}</p>}
          {config.ctaLabel && config.ctaHref && (
            <Link
              href={config.ctaHref}
              className={buttonVariants({ variant: "primary", size: "sm", className: "w-fit" })}
            >
              {config.ctaLabel}
            </Link>
          )}
        </div>
      )}

      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {playing ? (
          <iframe
            src={withAutoplay(config.embedUrl)}
            title={title}
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
            aria-label={`Play video: ${title}`}
            className="group relative h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {poster && !posterFailed ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={poster}
                  alt=""
                  loading="lazy"
                  onError={() => setPosterFailed(true)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-black/30 transition group-hover:bg-black/40" />
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-2xl text-foreground transition group-hover:bg-white"
                >
                  ▶
                </span>
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-muted text-sm text-muted transition group-hover:text-accent">
                <span
                  aria-hidden
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/10 text-lg transition group-hover:bg-accent/20"
                >
                  ▶
                </span>
                <span>Play video</span>
                <span className="text-xs underline decoration-dotted">or watch on {label}</span>
              </div>
            )}
          </button>
        )}
      </div>
    </section>
  );
}
