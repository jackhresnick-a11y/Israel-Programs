"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { isEmbedUrl } from "@/lib/videoEmbed";

type Video = {
  id: string;
  url: string;
  caption: string | null;
};

const MAX_LOAD_RETRIES = 4;
const RETRY_DELAY_MS = 1500;

/**
 * YouTube/Vimeo videos render as an embed iframe; legacy Vercel Blob file
 * URLs keep the <video> element. For the blob path: a freshly-uploaded blob
 * can occasionally 404/error on its first load if the CDN edge the browser
 * hits hasn't picked up the object yet, which otherwise sticks as a
 * permanent black box until a manual page reload. Retry a few times with a
 * cache-busting query param instead of giving up after the first error.
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

  if (isEmbedUrl(url)) {
    return (
      <iframe
        src={url}
        title="Program video"
        className="aspect-video w-full rounded-lg border border-border"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        allowFullScreen
      />
    );
  }

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
