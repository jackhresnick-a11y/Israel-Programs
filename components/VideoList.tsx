"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { platformForStoredUrl, watchUrlForStoredUrl, type Provider } from "@/lib/videoEmbed";

type Video = {
  id: string;
  url: string;
  caption: string | null;
};

const MAX_LOAD_RETRIES = 4;
const RETRY_DELAY_MS = 1500;

const PLATFORM_LABEL: Record<Provider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** Portrait platforms (reels/shorts-shaped) get a taller, narrower frame instead of 16:9. */
const PORTRAIT_PLATFORMS = new Set<Provider>(["instagram", "tiktok"]);

/**
 * YouTube/Vimeo load their iframe immediately (lightweight, no SDK). Facebook,
 * Instagram, and TikTok embeds are comparatively heavy third-party documents
 * (Instagram's alone is ~600KB), so those render a neutral click-to-load
 * facade first and only mount the iframe once a moderator/visitor actually
 * wants to watch -- a program page can list several videos, and nothing
 * should force five third-party documents to load on page view.
 */
const LAZY_LOAD_PLATFORMS = new Set<Provider>(["facebook", "instagram", "tiktok"]);

/**
 * Every iframe gets an explicit sandbox + allow list -- never a bare iframe.
 * allow-same-origin is required for the platforms' own players to read
 * their own cookies/storage; allow-popups(+escape) lets "share"/"login"
 * links in the embed open a real tab instead of silently failing.
 */
export const EMBED_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation";
export const EMBED_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
export const EMBED_REFERRER_POLICY = "strict-origin-when-cross-origin" as const;

function EmbedFrame({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      title="Program video"
      className="h-full w-full rounded-lg border border-border"
      sandbox={EMBED_SANDBOX}
      allow={EMBED_ALLOW}
      referrerPolicy={EMBED_REFERRER_POLICY}
      loading="lazy"
      allowFullScreen
    />
  );
}

function LazyEmbedFacade({
  url,
  provider,
  watchUrl,
}: {
  url: string;
  provider: Provider;
  watchUrl: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const label = PLATFORM_LABEL[provider];

  if (loaded) {
    return <EmbedFrame url={url} />;
  }

  return (
    <button
      type="button"
      onClick={() => setLoaded(true)}
      className="group flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-muted text-sm text-muted transition hover:border-accent hover:text-accent"
    >
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/10 text-lg transition group-hover:bg-accent/20"
      >
        ▶
      </span>
      <span>Play {label} video</span>
      {watchUrl && (
        <span className="text-xs underline decoration-dotted">
          or watch on {label}
        </span>
      )}
    </button>
  );
}

/** Clean link-out for platforms/URLs that can't (or shouldn't) render as an iframe. */
function WatchOnLink({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-muted text-sm text-muted transition hover:border-accent hover:text-accent"
    >
      <span aria-hidden className="text-lg">
        ↗
      </span>
      <span className="underline">Watch on {label}</span>
    </a>
  );
}

/**
 * YouTube/Vimeo/Facebook/Instagram/TikTok videos render as an embed iframe
 * (lazy-loaded facade for the heavier third-party platforms); legacy Vercel
 * Blob file URLs keep the <video> element; anything else renders a clean
 * "Watch on [Platform]" link rather than a broken iframe or blank box.
 */
export function VideoPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const retriesRef = useRef(0);
  const [src, setSrc] = useState(url);
  const [failed, setFailed] = useState(false);

  function handleError() {
    if (retriesRef.current >= MAX_LOAD_RETRIES) {
      setFailed(true);
      return;
    }
    retriesRef.current += 1;
    setTimeout(() => {
      setSrc(`${url}?retry=${retriesRef.current}`);
      videoRef.current?.load();
    }, RETRY_DELAY_MS * retriesRef.current);
  }

  const provider = platformForStoredUrl(url);

  if (provider) {
    const watchUrl = watchUrlForStoredUrl(url);
    const aspectClass = PORTRAIT_PLATFORMS.has(provider) ? "aspect-[9/16] max-h-[70vh]" : "aspect-video";

    return (
      <div className={`${aspectClass} w-full`}>
        {LAZY_LOAD_PLATFORMS.has(provider) ? (
          <LazyEmbedFacade url={url} provider={provider} watchUrl={watchUrl} />
        ) : (
          <EmbedFrame url={url} />
        )}
      </div>
    );
  }

  // Legacy Vercel Blob file URLs (predate embed-only videos) keep the
  // <video> element and its CDN-propagation retry.
  if (/\.public\.blob\.vercel-storage\.com\//.test(url)) {
    if (failed) {
      return (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-border bg-surface-muted text-sm text-muted">
          Video failed to load. Try refreshing the page.
        </div>
      );
    }
    return (
      <video
        ref={videoRef}
        src={src}
        controls
        preload="metadata"
        onError={handleError}
        className="w-full rounded-lg border border-border"
      />
    );
  }

  // Anything else (an unrecognized or unparseable stored URL) degrades to a
  // clean link-out -- never a broken iframe or blank box.
  return <WatchOnLink url={url} label="original source" />;
}

export default function VideoList({
  videos,
  isModerator,
}: {
  videos: Video[];
  isModerator: boolean;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this video?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) router.refresh();
  }

  if (videos.length === 0) {
    return <p className="text-sm text-muted">No videos yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {videos.map((video) => (
        <div key={video.id} className="flex flex-col gap-2">
          <VideoPlayer url={video.url} />
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{video.caption}</span>
            {isModerator && (
              <button
                onClick={() => handleDelete(video.id)}
                disabled={deletingId === video.id}
                className="text-danger hover:underline disabled:opacity-50"
              >
                {deletingId === video.id ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
